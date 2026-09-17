// Run in an MCP-capable host. No API token, REST publisher, timer or auto-start.
// query(sql, values) must return rows and bind parameters; schedule(args) invokes MCP.
export function consumer({ query, schedule, validateMedia, uuid = () => crypto.randomUUID(), now = () => new Date() }) {
  async function consume(id, { dryRun = true } = {}) {
    const [post] = await query(`select s.*, a.status::text as article_status,
      coalesce((p.value->>'enabled')::boolean,false) as enabled
      from public.social_posts s join public.articles a on a.id=s.article_id
      left join public.site_settings p on p.key='social_distribution_policy'
      where s.id=$1::uuid`, [id]);
    if (!post) return { status: 'not_found' };
    if (!dryRun && !post.enabled) return { status: 'disabled' };
    if (post.status !== 'ready') return { status: 'not_ready' };
    const invalid = post.article_status !== 'published' ? 'article_not_published'
      : !['facebook','instagram'].includes(post.network) ? 'unsupported_network'
      : !post.post_text?.trim() ? 'empty_text'
      : post.network === 'instagram' && !post.media_urls?.length ? 'instagram_requires_media'
      : null;
    let error = invalid;
    if (!error) {
      try { await validateMedia(post.media_urls || [], post.network); }
      catch { error = 'invalid_media'; }
    }
    if (error) {
      if (!dryRun) await query(`update public.social_posts set status='failed',
        last_error_code=$3,last_error='Preflight validation failed; no provider call made'
        where id=$1::uuid and status='ready' and updated_at=$2::timestamptz returning id`,
        [id,post.updated_at,error]);
      return { status: 'invalid', error };
    }
    const date = new Date(Math.max(new Date(post.scheduled_for).getTime() || 0, now().getTime()+120000)).toISOString();
    const info = {
      text: post.post_text, providers: [{ network: post.network }],
      publicationDate: { dateTime: new Intl.DateTimeFormat('sv-SE', {
        timeZone:'Europe/Copenhagen', year:'numeric',month:'2-digit',day:'2-digit',
        hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
      }).format(new Date(date)).replace(' ','T'), timezone:'Europe/Copenhagen' },
      autoPublish:true,draft:false,shortener:false,
      media:post.media_urls || [],mediaAltText:post.media_alt_text || [],
      saveExternalMediaFiles:Boolean(post.media_urls?.length),
      ...(post.network === 'instagram'
        ? {instagramData:{type:'POST',isAiGenerated:Boolean(post.metadata?.hero_ai_generated)}}
        : {facebookData:{type:'POST'}})
    };
    const args = { blogId:'6923586',date,info:JSON.stringify(info) };
    if (dryRun) return {status:'dry_run', enabled:post.enabled, args};
    const claim = uuid();
    // CAS protects against payload edits during preflight and concurrent consumers.
    const rows = await query(`update public.social_posts s set status='failed',attempts=attempts+1,
      last_error_code='provider_outcome_unknown',last_error='Reserved MCP attempt; reconcile before retry',
      metadata=metadata||jsonb_build_object('mcp_claim_token',$3::text,'mcp_claimed_at',now())
      where s.id=$1::uuid and s.status='ready' and s.updated_at=$2::timestamptz
      and s.provider_ref='{}'::jsonb
      and exists(select 1 from public.articles a where a.id=s.article_id and a.status='published')
      and exists(select 1 from public.site_settings p where p.key='social_distribution_policy'
        and p.value->>'enabled'='true') returning s.id`, [id,post.updated_at,claim]);
    if (rows.length !== 1) return {status:'not_claimed'};
    let result;
    try { result = await schedule(args); }
    catch { return {status:'provider_outcome_unknown',id,claim}; }
    // Persist even unrecognised/error replies for reconciliation. Do not resend.
    const receipt = {mcp_result:result,requested_date:date};
    const ack = result?.structuredContent || result;
    // A host must normalize the MCP receipt; do not guess success from prose.
    const accepted = result?.isError !== true && ack?.accepted === true
      && (typeof ack?.id === 'string' || typeof ack?.id === 'number')
      && typeof ack?.plannerUrl === 'string';
    try {
      const saved = await query(`update public.social_posts set provider_ref=$3::jsonb,
        status=$4::public.social_post_status,scheduled_for=$5::timestamptz,
        last_error_code=$6,last_error=$7
        where id=$1::uuid and status='failed' and last_error_code='provider_outcome_unknown'
        and metadata->>'mcp_claim_token'=$2 returning id`,
        [id,claim,JSON.stringify(receipt),accepted?'scheduled':'failed',date,
         accepted?null:'provider_outcome_unknown',accepted?null:'Provider reply requires reconciliation']);
      if (saved.length !== 1) throw new Error('receipt_not_saved');
    } catch { return {status:'receipt_not_saved',id,claim,receipt}; }
    return {status:accepted?'scheduled':'provider_outcome_unknown',id};
  }
  return {consume};
}

