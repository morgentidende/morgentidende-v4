// First rollout supports static PNG/JPEG posts only. Reels/WebP fail closed.
const MAX = 8 * 1024 * 1024;
export async function validateMedia(urls, network, fetcher = fetch) {
  if (!Array.isArray(urls) || urls.length > 10) throw new Error('media_count');
  if (network === 'instagram' && !urls.length) throw new Error('instagram_requires_media');
  for (const value of urls) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'media.morgentidende.dk'
      || url.port || url.username || url.password) throw new Error('unapproved_media_origin');
    const response = await fetcher(url.href, {redirect:'error',signal:AbortSignal.timeout(15000)});
    if (!response.ok || !response.body) throw new Error('media_unreachable');
    const type = response.headers.get('content-type')?.split(';')[0];
    if (!['image/png','image/jpeg'].includes(type)) {await response.body.cancel(); throw new Error('unsupported_media');}
    const reader=response.body.getReader(); let size=0; const chunks=[];
    try {
      while(true) {const {value,done}=await reader.read(); if(done) break;
        size+=value.length; if(size>MAX) throw new Error('media_too_large'); chunks.push(value);}
    } finally {await reader.cancel();}
    const bytes = Buffer.concat(chunks.map(c=>Buffer.from(c)));
    const {width,height}=dimensions(bytes,type);
    if (network === 'instagram' && (width<320 || width>1440 || width/height<0.75 || width/height>1.91))
      throw new Error('instagram_dimensions');
  }
}
export function dimensions(b,type) {
  if(type==='image/png') {
    if(b.length<45 || b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'
      || b.subarray(12,16).toString()!=='IHDR' || b.subarray(-8,-4).toString()!=='IEND') throw new Error('invalid_png');
    const width=b.readUInt32BE(16),height=b.readUInt32BE(20);
    if(!width||!height) throw new Error('invalid_dimensions');
    return {width,height};
  }
  if(type!=='image/jpeg' || b.length<12 || b.readUInt16BE(0)!==0xffd8 || b.readUInt16BE(b.length-2)!==0xffd9)
    throw new Error('invalid_jpeg');
  let i=2;
  while(i+4<b.length) {
    if(b[i++]!==0xff) throw new Error('invalid_jpeg_marker');
    while(b[i]===0xff) i++;
    const marker=b[i++]; if(marker===0xda||marker===0xd9) break;
    const n=b.readUInt16BE(i); if(n<2||i+n>b.length) break;
    if([0xc0,0xc1,0xc2].includes(marker)&&n>=8) {
      const height=b.readUInt16BE(i+3),width=b.readUInt16BE(i+5);
      if(!width||!height) break; return {width,height};
    }
    i+=n;
  }
  throw new Error('jpeg_dimensions_missing');
}

