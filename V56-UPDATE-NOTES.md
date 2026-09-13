# V56 Update

- Removed the Mind Maps column from the batch subject listing.
- Subject page order: Search → compact Your Course Progress → Mind Maps → videos.
- Each subject now has two Mind Map PDF buttons: Subject (English) and Subject (Hindi).
- History keeps Ancient / Medieval / Modern sections below Mind Maps; selecting a section shows its videos/classes.
- Admin Mind Maps panel now uploads English and Hindi PDFs independently.
- Added dedicated public `mind-maps` storage bucket with admin-only write policies.
- Batch 4.0 and 5.0 remain separated for classes, PDFs and Mind Maps.
- Existing `materials` and `videos` buckets remain for class resources; no existing content is deleted.
- New SQL migration: `database_update_v56_mind_maps_two_pdfs.sql`.
