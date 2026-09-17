# Dedupe ownership

Morgentidende har præcis én redaktionel dubletkontrol: den semantiske 7-dages-dedupe efter Research og før Write i `docs/automations/news-task.md`.

Backend, Media, Article QA og Safe Publish må ikke udføre en ny semantisk dubletvurdering. De må kun håndhæve teknisk idempotens og øvrige publication-invariants.

Hvis en dublet undtagelsesvis slipper igennem pre-write dedupe, accepteres det som en mindre redaktionel fejl frem for at genindføre et parallelt dedupe-system.
