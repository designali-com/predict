-- The DynaMo test catalogue, in our own database.
--
-- Seeded from VALD's DynaMo app configuration (every test the DynaMo offers,
-- with VALD's own region / movement / position names) and from VALD's public
-- protocol articles on support.vald.com (the steps and the Vimeo video). The
-- clinic owns it from here: tests can be switched off, edited or added, and a
-- clinic-made video put in place of VALD's. Results still go to vald_test.

CREATE TABLE IF NOT EXISTS "vald_test_type" (
  "key" text PRIMARY KEY,
  "label" text NOT NULL,
  "region" text NOT NULL,
  "category" text NOT NULL,
  "movement" text NOT NULL,
  "position" text NOT NULL,
  "position_label" text NOT NULL,
  "laterality" text NOT NULL DEFAULT 'Bilateral',
  "kind" text NOT NULL,
  "rom_offset_degrees" double precision NOT NULL DEFAULT 0,
  "grip_device_ok" boolean NOT NULL DEFAULT false,
  "setup" text,
  "video_url" text,
  "video_source" text,
  "source_url" text,
  "featured" boolean NOT NULL DEFAULT false,
  "active" boolean NOT NULL DEFAULT true,
  "origin" text NOT NULL DEFAULT 'vald',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO "vald_test_type" ("key", "label", "region", "category", "movement", "position", "position_label", "laterality", "kind", "rom_offset_degrees", "grip_device_ok", "setup", "video_url", "video_source", "source_url", "featured", "active", "origin") VALUES
('neck-flexion-seated', 'Neck flexion', 'Neck', 'Strength', 'Flexion', 'Seated', 'Seated', 'None', 'force', 0, false, 'Patient position
Sitting at the edge of the table with their arms crossed and hands on opposite shoulders, and their feet flat on the ground.
Contact point
Anterior aspect of patient''s forehead.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing adjacent to the patient, with one hand holding the DynaMo Plus and resisting anterior force applied by the patient, the other supporting the patient''s upper back.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742519338', 'vald', NULL, false, true, 'vald'),
('neck-flexion-standing', 'Neck flexion', 'Neck', 'Strength', 'Flexion', 'Standing', 'Standing', 'None', 'force', 0, false, 'Patient position
Sitting at the edge of the table with their arms crossed and hands on opposite shoulders, and their feet flat on the ground.
Contact point
Anterior aspect of patient''s forehead.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing adjacent to the patient, with one hand holding the DynaMo Plus and resisting anterior force applied by the patient, the other supporting the patient''s upper back.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742519417', 'vald', NULL, false, true, 'vald'),
('neck-extension-seated', 'Neck extension', 'Neck', 'Strength', 'Extension', 'Seated', 'Seated', 'None', 'force', 0, false, 'Patient position
Sitting at the edge of the table with their arms crossed and hands on opposite shoulders, and their feet flat on the ground.
Contact point
Posterior aspect of patient''s head, just superior to the occiput.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing adjacent to the patient, with one hand holding the DynaMo Plus and resisting posterior force applied by the patient, the other placed on the patient''s arms supporting the patient''s torso anteriorly.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742519119', 'vald', NULL, false, true, 'vald'),
('neck-extension-standing', 'Neck extension', 'Neck', 'Strength', 'Extension', 'Standing', 'Standing', 'None', 'force', 0, false, 'Patient position
Sitting at the edge of the table with their arms crossed and hands on opposite shoulders, and their feet flat on the ground.
Contact point
Posterior aspect of patient''s head, just superior to the occiput.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing adjacent to the patient, with one hand holding the DynaMo Plus and resisting posterior force applied by the patient, the other placed on the patient''s arms supporting the patient''s torso anteriorly.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742519257', 'vald', NULL, false, true, 'vald'),
('neck-extension-prone', 'Neck extension', 'Neck', 'Strength', 'Extension', 'Prone', 'Prone', 'None', 'force', 0, false, 'Patient position
Prone, with their arms hugging the edge of the table, and their head extending past the edge of the table so that it remains unsupported.
Contact point
Circumference of the patient''s head via the cable strap.
Device orientation
Vertical, with the cable strap around the patient''s head and the hand attachment held by the practitioner, anterior to the patient''s head.
Position of examiner
Standing adjacent to the patient''s head, supporting the DynaMo Plus with both hands.
Instruction
Pull the DynaMo Plus as hard as you can. 3, 2, 1 - pull, pull, pull and relax.
Attachments
Cable strap and hand attachment.', 'https://player.vimeo.com/video/742519052', 'vald', NULL, false, true, 'vald'),
('neck-flexion-extension-seated', 'Neck flexion / extension', 'Neck', 'Strength', 'FlexionExtension', 'Seated', 'Seated', 'None', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('neck-flexion-extension-standing', 'Neck flexion / extension', 'Neck', 'Strength', 'FlexionExtension', 'Standing', 'Standing', 'None', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('neck-flexion-extension-prone', 'Neck flexion / extension', 'Neck', 'Strength', 'FlexionExtension', 'Prone', 'Prone', 'None', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('neck-lateral-flexion-left-seated', 'Neck lateral flexion (left)', 'Neck', 'Strength', 'LateralFlexionLeft', 'Seated', 'Seated', 'None', 'force', 0, false, 'Patient position
Sitting off the edge of the bed with feet on the floor, their arms relaxed at their sides and hands on their thighs.
Contact point
On the temporal bone, just superior to the ear.
Device orientation
Horizontal, with the palm pad supported by the assessor and the curved pad in contact with the patient.
Position of examiner
Standing beside the patient, holding the DynaMo Plus with one hand, applying lateral pressure and supporting the patient''s opposite shoulder to ensure they remain stable with the other hand.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742519555', 'vald', NULL, false, true, 'vald'),
('neck-lateral-flexion-left-standing', 'Neck lateral flexion (left)', 'Neck', 'Strength', 'LateralFlexionLeft', 'Standing', 'Standing', 'None', 'force', 0, false, 'Patient position
Standing with their arms at their sides.
Contact point
Lateral aspect of patient''s head, on the temporal bone.
Device orientation
Horizontal, with the practitioner supporting the palm pad and the curved pad in contact with the patient.
Position of examiner
Standing adjacent to the patient, supporting the DynaMo Plus with one hand and supporting the patient''s opposite shoulder with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742519686', 'vald', NULL, false, true, 'vald'),
('neck-lateral-flexion-left-prone', 'Neck lateral flexion (left)', 'Neck', 'Strength', 'LateralFlexionLeft', 'Prone', 'Prone', 'None', 'force', 0, false, 'Patient position
Prone, with their arms hugging the edge of the table, and their head extending past the edge of the table so that it remains unsupported.
Contact point
Circumference of the patient''s head via the cable strap.
Device orientation
Horizontal, with the cable strap around the patient''s head and the hand attachment held by the practitioner, to the right of the patient''s head.
Position of examiner
Standing adjacent to the patient''s head, supporting the DynaMo Plus with both hands.
Instruction
Pull the DynaMo Plus as hard as you can. 3, 2, 1 - pull, pull, pull and relax.
Attachments
Cable strap and hand attachment.', 'https://player.vimeo.com/video/742519772', 'vald', NULL, false, true, 'vald'),
('neck-lateral-flexion-right-seated', 'Neck lateral flexion (right)', 'Neck', 'Strength', 'LateralFlexionRight', 'Seated', 'Seated', 'None', 'force', 0, false, 'Patient position
Sitting off the edge of the bed with feet on the floor, their arms relaxed at their sides and hands on their thighs.
Contact point
On the temporal bone, just superior to the ear.
Device orientation
Horizontal, with the palm pad supported by the assessor and the curved pad in contact with the patient.
Position of examiner
Standing beside the patient, holding the DynaMo Plus with one hand, applying lateral pressure and supporting the patient''s opposite shoulder to ensure they remain stable with the other hand.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742537685', 'vald', NULL, false, true, 'vald'),
('neck-lateral-flexion-right-standing', 'Neck lateral flexion (right)', 'Neck', 'Strength', 'LateralFlexionRight', 'Standing', 'Standing', 'None', 'force', 0, false, 'Patient position
Standing with their arms at their sides.
Contact point
Lateral aspect of patient''s head, on the temporal bone.
Device orientation
Horizontal, with the practitioner supporting the palm pad and the curved pad in contact with the patient.
Position of examiner
Standing adjacent to the patient, supporting the DynaMo Plus with one hand and supporting the patient''s opposite shoulder with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742519732', 'vald', NULL, false, true, 'vald'),
('neck-lateral-flexion-right-prone', 'Neck lateral flexion (right)', 'Neck', 'Strength', 'LateralFlexionRight', 'Prone', 'Prone', 'None', 'force', 0, false, 'Patient position
Prone, with their arms hugging the edge of the table, and their head extending past the edge of the table so that it remains unsupported.
Contact point
Circumference of the patient''s head via the cable strap.
Device orientation
Horizontal, with the cable strap around the patient''s head and the hand attachment held by the practitioner, to the right of the patient''s head.
Position of examiner
Standing adjacent to the patient''s head, supporting the DynaMo Plus with both hands.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Cable strap and hand attachment.', 'https://player.vimeo.com/video/742519813', 'vald', NULL, false, true, 'vald'),
('neck-lateral-flexion-left-lateral-flexion-right-seated', 'Neck lateral flexion (left) / lateral flexion (right)', 'Neck', 'Strength', 'LateralFlexionLeftLateralFlexionRight', 'Seated', 'Seated', 'None', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('neck-lateral-flexion-left-lateral-flexion-right-standing', 'Neck lateral flexion (left) / lateral flexion (right)', 'Neck', 'Strength', 'LateralFlexionLeftLateralFlexionRight', 'Standing', 'Standing', 'None', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('neck-lateral-flexion-left-lateral-flexion-right-prone', 'Neck lateral flexion (left) / lateral flexion (right)', 'Neck', 'Strength', 'LateralFlexionLeftLateralFlexionRight', 'Prone', 'Prone', 'None', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('neck-protraction-seated', 'Neck protraction', 'Neck', 'Strength', 'Protraction', 'Seated', 'Seated', 'None', 'force', 0, false, 'Patient position
Sitting at the edge of the table with their arms crossed and hands on opposite shoulders, and their feet flat on the ground.
Contact point
Anterior aspect of patient''s forehead.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing adjacent to the patient, with one hand holding the DynaMo Plus and resisting anterior force applied by the patient, the other supporting the patient''s upper back.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', NULL, NULL, NULL, false, true, 'vald'),
('neck-retraction-seated', 'Neck retraction', 'Neck', 'Strength', 'Retraction', 'Seated', 'Seated', 'None', 'force', 0, false, 'Patient position
Sitting at the edge of the table with their arms crossed and hands on opposite shoulders, and their feet flat on the ground.
Contact point
Anterior aspect of patient''s forehead.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing adjacent to the patient, with one hand holding the DynaMo Plus and resisting anterior force applied by the patient, the other supporting the patient''s upper back.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', NULL, NULL, NULL, false, true, 'vald'),
('neck-flexion-seated-rom', 'Neck flexion ROM', 'Neck', 'RangeofMotion', 'Flexion', 'Seated', 'Seated', 'None', 'rom', 0, false, 'Patient position
Seated on a chair with feet on the floor and both hands rested on the patient''s thighs.
Contact point
The tie-down strap in contact with the front of the patient''s head, at the level of the forehead.
Device orientation
Horizontal, linked to the tie-down strap at one end and anchored to a fixed surface by the cable strap at the other, anterior to the patient.
Position of examiner
Seated next to the patient in a position to orientate the DynaMo Plus, instruct and demonstrate the movement.
Instruction
Flex your neck as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
Tie-down and cable strap.', 'https://player.vimeo.com/video/742537633', 'vald', NULL, false, true, 'vald'),
('neck-flexion-standing-rom', 'Neck flexion ROM', 'Neck', 'RangeofMotion', 'Flexion', 'Standing', 'Standing', 'None', 'rom', 0, false, 'Patient position
Seated on a chair with feet on the floor and both hands rested on the patient''s thighs.
Contact point
The tie-down strap in contact with the front of the patient''s head, at the level of the forehead.
Device orientation
Horizontal, linked to the tie-down strap at one end and anchored to a fixed surface by the cable strap at the other, anterior to the patient.
Position of examiner
Seated next to the patient in a position to orientate the DynaMo Plus, instruct and demonstrate the movement.
Instruction
Flex your neck as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
Tie-down and cable strap.', 'https://player.vimeo.com/video/742537633', 'vald', NULL, false, true, 'vald'),
('neck-extension-seated-rom', 'Neck extension ROM', 'Neck', 'RangeofMotion', 'Extension', 'Seated', 'Seated', 'None', 'rom', 0, false, 'Patient position
Sitting on a chair, with arms bracing their body.
Contact point
Top of the head.
Device orientation
Vertical, in the centre of their head.
Position of examiner
Standing, adjacent to the patient so that they are comfortably able to support the DynaMo Plus as the patient moves throughout range of motion.
Instruction
Move your head towards your back, keeping the DynaMo Plus as still as possible.
Attachments
None.', 'https://player.vimeo.com/video/742519174', 'vald', NULL, false, true, 'vald'),
('neck-extension-standing-rom', 'Neck extension ROM', 'Neck', 'RangeofMotion', 'Extension', 'Standing', 'Standing', 'None', 'rom', 0, false, 'Patient position
Sitting on a chair, with arms bracing their body.
Contact point
Top of the head.
Device orientation
Vertical, in the centre of their head.
Position of examiner
Standing, adjacent to the patient so that they are comfortably able to support the DynaMo Plus as the patient moves throughout range of motion.
Instruction
Move your head towards your back, keeping the DynaMo Plus as still as possible.
Attachments
None.', 'https://player.vimeo.com/video/742519174', 'vald', NULL, false, true, 'vald'),
('neck-flexion-extension-seated-rom', 'Neck flexion / extension ROM', 'Neck', 'RangeofMotion', 'FlexionExtension', 'Seated', 'Seated', 'None', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('neck-flexion-extension-standing-rom', 'Neck flexion / extension ROM', 'Neck', 'RangeofMotion', 'FlexionExtension', 'Standing', 'Standing', 'None', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('neck-lateral-flexion-left-seated-rom', 'Neck lateral flexion (left) ROM', 'Neck', 'RangeofMotion', 'LateralFlexionLeft', 'Seated', 'Seated', 'None', 'rom', 0, false, 'Patient position
Sitting on a chair, with arms bracing their body.
Contact point
Top of the head.
Device orientation
Vertical, in the centre of their head.
Position of examiner
Standing, adjacent to the patient so that they are comfortably able to support the DynaMo Plus as the patient moves throughout range of motion.
Instruction
Move your head towards your shoulder, keeping the DynaMo Plus as still as possible.
Attachments
None.', 'https://player.vimeo.com/video/742519595', 'vald', NULL, false, true, 'vald'),
('neck-lateral-flexion-left-standing-rom', 'Neck lateral flexion (left) ROM', 'Neck', 'RangeofMotion', 'LateralFlexionLeft', 'Standing', 'Standing', 'None', 'rom', 0, false, 'Patient position
Sitting on a chair, with arms bracing their body.
Contact point
Top of the head.
Device orientation
Vertical, in the centre of their head.
Position of examiner
Standing, adjacent to the patient so that they are comfortably able to support the DynaMo Plus as the patient moves throughout range of motion.
Instruction
Move your head towards your shoulder, keeping the DynaMo Plus as still as possible.
Attachments
None.', 'https://player.vimeo.com/video/742519595', 'vald', NULL, false, true, 'vald'),
('neck-lateral-flexion-right-seated-rom', 'Neck lateral flexion (right) ROM', 'Neck', 'RangeofMotion', 'LateralFlexionRight', 'Seated', 'Seated', 'None', 'rom', 0, false, 'Patient position
Sitting on a chair, with arms bracing their body.
Contact point
Top of the head.
Device orientation
Vertical, in the centre of their head.
Position of examiner
Standing, adjacent to the patient so that they are comfortably able to support the DynaMo Plus as the patient moves throughout range of motion.
Instruction
Move your head towards your shoulder, keeping the DynaMo Plus as still as possible.
Attachments
None.', 'https://player.vimeo.com/video/742519634', 'vald', NULL, false, true, 'vald'),
('neck-lateral-flexion-right-standing-rom', 'Neck lateral flexion (right) ROM', 'Neck', 'RangeofMotion', 'LateralFlexionRight', 'Standing', 'Standing', 'None', 'rom', 0, false, 'Patient position
Sitting on a chair, with arms bracing their body.
Contact point
Top of the head.
Device orientation
Vertical, in the centre of their head.
Position of examiner
Standing, adjacent to the patient so that they are comfortably able to support the DynaMo Plus as the patient moves throughout range of motion.
Instruction
Move your head towards your shoulder, keeping the DynaMo Plus as still as possible.
Attachments
None.', 'https://player.vimeo.com/video/742519634', 'vald', NULL, false, true, 'vald'),
('neck-lateral-flexion-left-lateral-flexion-right-seated-rom', 'Neck lateral flexion (left) / lateral flexion (right) ROM', 'Neck', 'RangeofMotion', 'LateralFlexionLeftLateralFlexionRight', 'Seated', 'Seated', 'None', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('neck-lateral-flexion-left-lateral-flexion-right-standing-rom', 'Neck lateral flexion (left) / lateral flexion (right) ROM', 'Neck', 'RangeofMotion', 'LateralFlexionLeftLateralFlexionRight', 'Standing', 'Standing', 'None', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('neck-protraction-seated-rom', 'Neck protraction ROM', 'Neck', 'RangeofMotion', 'Protraction', 'Seated', 'Seated', 'None', 'rom', 0, false, 'Patient position
Seated on a chair with feet on the floor and both hands rested on the patient''s thighs.
Contact point
The tie-down strap in contact with the front of the patient''s head, at the level of the forehead.
Device orientation
Horizontal, linked to the tie-down strap at one end and anchored to a fixed surface by the cable strap at the other, anterior to the patient.
Position of examiner
Seated next to the patient in a position to orientate the DynaMo Plus, instruct and demonstrate the movement.
Instruction
Flex your neck as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
Tie-down and cable strap.', NULL, NULL, NULL, false, true, 'vald'),
('neck-retraction-seated-rom', 'Neck retraction ROM', 'Neck', 'RangeofMotion', 'Retraction', 'Seated', 'Seated', 'None', 'rom', 0, false, 'Patient position
Sitting on a chair, with arms bracing their body.
Contact point
Top of the head.
Device orientation
Vertical, in the centre of their head.
Position of examiner
Standing, adjacent to the patient so that they are comfortably able to support the DynaMo Plus as the patient moves throughout range of motion.
Instruction
Move your head towards your back, keeping the DynaMo Plus as still as possible.
Attachments
None.', NULL, NULL, NULL, false, true, 'vald'),
('neck-rotation-left-seated-rom', 'Neck rotation (left) ROM', 'Neck', 'RangeofMotion', 'RotationLeft', 'Seated', 'Seated', 'None', 'rom', 0, false, 'Patient position
Seated with their arms relaxed by their side.
Contact point
The top of the patient''s head.
Device orientation
Horizontal, consistent with the position of the patient''s head.
Position of examiner
Standing adjacent to the patient, in position to demonstrate and instruct the movement.
Instruction
Rotate your neck as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
None.', 'https://player.vimeo.com/video/742519014', 'vald', NULL, false, true, 'vald'),
('neck-rotation-right-seated-rom', 'Neck rotation (right) ROM', 'Neck', 'RangeofMotion', 'RotationRight', 'Seated', 'Seated', 'None', 'rom', 0, false, 'Patient position
Seated with their arms relaxed by their side.
Contact point
The top of the patient''s head.
Device orientation
Horizontal, consistent with the position of the patient''s head.
Position of examiner
Standing adjacent to the patient, in position to demonstrate and instruct the movement.
Instruction
Rotate your neck as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
None.', 'https://player.vimeo.com/video/742519844', 'vald', NULL, false, true, 'vald'),
('neck-rotation-left-rotation-right-seated-rom', 'Neck rotation (left) / rotation (right) ROM', 'Neck', 'RangeofMotion', 'RotationLeftRotationRight', 'Seated', 'Seated', 'None', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('shoulder-internal-rotation-seated-elbow-90-degrees', 'Shoulder internal rotation', 'Shoulder', 'Strength', 'InternalRotation', 'SeatedElbow90Degrees', 'Seated - Elbow 90 Degrees', 'Bilateral', 'force', 0, false, 'Patient position
Sitting off the edge of the bed with feet on the floor, their elbow bent to 90 degrees and arm by their side, with their forearm in a neutral position.
Contact point
Anterior aspect of the forearm, just proximal to the wrist.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Sitting beside the patient, holding the DynaMo Plus with one hand, applying lateral pressure and supporting the patient to ensure they remain stable with the other hand.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742535012', 'vald', NULL, false, true, 'vald'),
('shoulder-internal-rotation-seated-elbow-90-degrees-90-degree-shoulder-abduction', 'Shoulder internal rotation', 'Shoulder', 'Strength', 'InternalRotation', 'SeatedElbow90Degrees90DegreeShoulderAbduction', 'Seated - Elbow 90 Degrees, 90 Degree Shoulder Abduction', 'Bilateral', 'force', 0, false, 'Patient position
Seated on a chair with feet on the floor and both hands rested on the patient''s thighs.
Contact point
The tie-down strap in contact with the back of the patient''s head, at the level of the occiput.
Device orientation
Horizontal, linked to the tie-down strap at one end and anchored to a fixed surface by the cable strap at the other, anterior to the patient.
Position of examiner
Seated next to the patient in a position to orientate the DynaMo Plus, instruct and demonstrate the movement.
Instruction
Pull against the DynaMo Plus as hard as you can. 3, 2, 1 - pull, pull, pull and relax.
Attachments
Tie-down and cable strap.', 'https://player.vimeo.com/video/742534676', 'vald', NULL, false, true, 'vald'),
('shoulder-internal-rotation-standing-elbow-90-degrees', 'Shoulder internal rotation', 'Shoulder', 'Strength', 'InternalRotation', 'StandingElbow90Degrees', 'Standing - Elbow 90 Degrees', 'Bilateral', 'force', 0, false, 'Patient position
Standing with the arm being tested at the patient''s side in 90 degrees elbow flexion and forearm in neutral.
Contact point
Anterior aspect of the forearm, just proximal to the wrist.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Seated adjacent to the patient, on the same side as the arm being tested, supporting the DynaMo Plus in one hand and the patient''s elbow with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742535184', 'vald', NULL, false, true, 'vald'),
('shoulder-internal-rotation-standing-elbow-90-degrees-90-degree-shoulder-abduction', 'Shoulder internal rotation', 'Shoulder', 'Strength', 'InternalRotation', 'StandingElbow90Degrees90DegreeShoulderAbduction', 'Standing - Elbow 90 Degrees, 90 Degree Shoulder Abduction', 'Bilateral', 'force', 0, false, 'Patient position
Standing, with the arm being tested in 90 degrees of shoulder abduction and elbow flexion.
Contact point
Hand attachment held in the patient''s hand.
Device orientation
Horizontal, connected to the hand attachment at one end and attached to a fixed surface posterior to the patient''s arm at the other.
Position of examiner
Standing next to the patient in position to instruct and demonstrate the movement.
Instruction
Pull against the DynaMo Plus as hard as you can. 3, 2, 1 - pull, pull, pull and relax.
Attachments
Hand attachment.', 'https://player.vimeo.com/video/742535138', 'vald', NULL, false, true, 'vald'),
('shoulder-internal-rotation-supine-elbow-90-degrees-90-degree-shoulder-abduction', 'Shoulder internal rotation', 'Shoulder', 'Strength', 'InternalRotation', 'SupineElbow90Degrees90DegreeShoulderAbduction', 'Supine - Elbow 90 Degrees, 90 Degree Shoulder Abduction', 'Bilateral', 'force', 0, false, 'Patient position
Supine, with the arm being assessed bent to 90 degrees shoulder abduction and elbow flexion.
Contact point
Distal aspect of the anterior forearm, just proximal to the wrist.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Seated at the side of the bed, holding the DynaMo Plus with one hand and supporting tested arm just proximal to the elbow with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742535242', 'vald', NULL, false, true, 'vald'),
('shoulder-internal-rotation-supine-elbow-90-degrees', 'Shoulder internal rotation', 'Shoulder', 'Strength', 'InternalRotation', 'SupineElbow90Degrees', 'Supine - Elbow 90 Degrees', 'Bilateral', 'force', 0, false, 'Patient position
Supine, with the arm being assessed bent to 90 degrees shoulder abduction and elbow flexion.
Contact point
Distal aspect of the anterior forearm, just proximal to the wrist.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Seated at the side of the bed, holding the DynaMo Plus with one hand and supporting tested arm just proximal to the elbow with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742535242', 'vald', NULL, false, true, 'vald'),
('shoulder-internal-rotation-prone', 'Shoulder internal rotation', 'Shoulder', 'Strength', 'InternalRotation', 'Prone', 'Prone', 'Bilateral', 'force', 0, false, 'Patient position
Prone on the table with arm being tested in 90 degrees shoulder abduction and elbow flexion.
Contact point
Anterior aspect of the patient''s forearm, just proximal to the wrist.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Seated or kneeling besides the table with one hand supporting the DynaMo Plus and the other supporting the patient''s upper arm, just proximal to their elbow.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742534632', 'vald', NULL, false, true, 'vald'),
('shoulder-external-rotation-seated-elbow-90-degrees', 'Shoulder external rotation', 'Shoulder', 'Strength', 'ExternalRotation', 'SeatedElbow90Degrees', 'Seated - Elbow 90 Degrees', 'Bilateral', 'force', 0, false, 'Patient position
Sitting upright, feet on the ground, with their arm being tested at their side, elbow flexed to 90 degrees and forearm in a neutral position, adjacent to a fixed surface.
Contact point
Posterior aspect of the forearm, just proximal to the wrist.
Device orientation
Horizontal, with the curved pad in contact with the patient and the flat pad in contact with a fixed surface.
Position of examiner
Standing next to the patient in position to place the DynaMo Plus, instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Flat pad and palm pad.', 'https://player.vimeo.com/video/742532717', 'vald', NULL, false, true, 'vald'),
('shoulder-external-rotation-seated-elbow-90-degrees-90-degree-shoulder-abduction', 'Shoulder external rotation', 'Shoulder', 'Strength', 'ExternalRotation', 'SeatedElbow90Degrees90DegreeShoulderAbduction', 'Seated - Elbow 90 Degrees, 90 Degree Shoulder Abduction', 'Bilateral', 'force', 0, false, 'Patient position
Sitting off the edge of the bed with feet on the floor, their elbow bent to 90 degrees, shoulder abducted to 90 degrees, with their forearm in a neutral position.
Contact point
Posterior aspect of the forearm, just proximal to the wrist.
Device orientation
Vertical, with the tester end up and palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Sitting beside the patient, holding the DynaMo Plus with one hand, applying upward pressure and supporting the patient to ensure they remain stable with the other hand.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742521458', 'vald', NULL, false, true, 'vald'),
('shoulder-external-rotation-standing-elbow-90-degrees', 'Shoulder external rotation', 'Shoulder', 'Strength', 'ExternalRotation', 'StandingElbow90Degrees', 'Standing - Elbow 90 Degrees', 'Bilateral', 'force', 0, false, 'Patient position
Standing upright, with their arm being tested at 90 degrees elbow flexion and forearm in a neutral position, adjacent to a fixed surface.
Contact point
Dorsal aspect of the hand, with the patient''s fist clenched.
Device orientation
Horizontal, with the curved pad in contact with the patient and the flat pad in contact with a fixed surface.
Position of examiner
Standing next to the patient in position to place the DynaMo Plus, instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Flat pad and palm pad.', 'https://player.vimeo.com/video/742533162', 'vald', NULL, false, true, 'vald'),
('shoulder-external-rotation-standing-elbow-90-degrees-90-degree-shoulder-abduction', 'Shoulder external rotation', 'Shoulder', 'Strength', 'ExternalRotation', 'StandingElbow90Degrees90DegreeShoulderAbduction', 'Standing - Elbow 90 Degrees, 90 Degree Shoulder Abduction', 'Bilateral', 'force', 0, false, 'Patient position
Standing with the arm being tested in 90 degrees shoulder abduction and 90 degree elbow flexion.
Contact point
Posterior aspect of the forearm, just proximal to the wrist.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing behind the patient, on the same side as the arm being tested, supporting the DynaMo Plus in one hand and the patient''s elbow with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742532999', 'vald', NULL, false, true, 'vald'),
('shoulder-external-rotation-side-lying', 'Shoulder external rotation', 'Shoulder', 'Strength', 'ExternalRotation', 'SideLying', 'Side Lying', 'Bilateral', 'force', 0, false, 'Patient position
Side-lying on non-testing side, with both hips and knees bent to 45 degrees and the arm being tested in 90 degrees elbow flexion.
Contact point
Posterior aspect of the forearm, just proximal to the wrist.
Device orientation
Vertical, with the tester end up and palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing next to the table, posterior to the patient, holding the DynaMo Plus with one hand and supporting the patient''s arm, just proximal to their elbow, with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742521422', 'vald', NULL, false, true, 'vald'),
('shoulder-external-rotation-supine-elbow-90-degrees-90-degree-shoulder-abduction', 'Shoulder external rotation', 'Shoulder', 'Strength', 'ExternalRotation', 'SupineElbow90Degrees90DegreeShoulderAbduction', 'Supine - Elbow 90 Degrees, 90 Degree Shoulder Abduction', 'Bilateral', 'force', 0, false, 'Patient position
Supine, with the arm being assessed bent to 90 degrees shoulder abduction and elbow flexion.
Contact point
Distal aspect of the posterior forearm, just proximal to the wrist.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Seated at the side of the bed, holding the DynaMo Plus with one hand and supporting tested arm just proximal to the elbow with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742533332', 'vald', NULL, false, true, 'vald'),
('shoulder-external-rotation-supine-elbow-90-degrees', 'Shoulder external rotation', 'Shoulder', 'Strength', 'ExternalRotation', 'SupineElbow90Degrees', 'Supine - Elbow 90 Degrees', 'Bilateral', 'force', 0, false, 'Patient position
Supine with the arm being tested in 0 degree shoulder abduction and 90 degrees elbow flexion.
Contact point
Held by the patient with the hand attachment.
Device orientation
Horizontal, linked to the hand attachment at one end and anchored to a fixed surface by the cable strap at the other, inferior to the patient''s arm being tested.
Position of examiner
Seated next to the patient in a position to orientate the DynaMo Plus, instruct and demonstrate the movement.
Instruction
Pull against the DynaMo Plus as hard as you can. 3, 2, 1 - pull, pull, pull and relax.
Attachments
Hand attachment and cable strap.', 'https://player.vimeo.com/video/742533447', 'vald', NULL, false, true, 'vald'),
('shoulder-external-rotation-supine-elbow-90-degrees-120-shoulder-abduction', 'Shoulder external rotation', 'Shoulder', 'Strength', 'ExternalRotation', 'SupineElbow90Degrees120ShoulderAbduction', 'Supine - Elbow 90 Degrees, 120 Shoulder Abduction', 'Bilateral', 'force', 0, false, 'Patient Position
Supine, with the arm being assessed bent to 120 degrees shoulder abduction and 90 degrees elbow flexion.
Contact Point
Distal aspect of the posterior forearm, just proximal to the wrist.
Device Orientation
Horizontal, with the palm pad supported by the assessor and the curved pad in contact with the patient.
Position of Examiner
Seated adjacent to the patient, on the same side as the arm being tested, supporting the DynaMo in one hand and the patient with the other.
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Curved pad and Flat pad', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-external-rotation-prone', 'Shoulder external rotation', 'Shoulder', 'Strength', 'ExternalRotation', 'Prone', 'Prone', 'Bilateral', 'force', 0, false, 'Patient position
Prone on the table with arm being tested in 90 degrees shoulder abduction and elbow flexion.
Contact point
Posterior aspect of the patient''s forearm, just proximal to the wrist.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Seated or kneeling besides the table with one hand supporting the DynaMo Plus and the other supporting the patient''s upper arm, just proximal to their elbow.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742521367', 'vald', NULL, false, true, 'vald'),
('shoulder-internal-rotation-external-rotation-seated-elbow-90-degrees', 'Shoulder internal rotation / external rotation', 'Shoulder', 'Strength', 'InternalRotationExternalRotation', 'SeatedElbow90Degrees', 'Seated - Elbow 90 Degrees', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('shoulder-internal-rotation-external-rotation-seated-elbow-90-degrees-90-degree-shoulder-abduction', 'Shoulder internal rotation / external rotation', 'Shoulder', 'Strength', 'InternalRotationExternalRotation', 'SeatedElbow90Degrees90DegreeShoulderAbduction', 'Seated - Elbow 90 Degrees, 90 Degree Shoulder Abduction', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('shoulder-internal-rotation-external-rotation-standing-elbow-90-degrees', 'Shoulder internal rotation / external rotation', 'Shoulder', 'Strength', 'InternalRotationExternalRotation', 'StandingElbow90Degrees', 'Standing - Elbow 90 Degrees', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('shoulder-internal-rotation-external-rotation-standing-elbow-90-degrees-90-degree-shoulder-abduction', 'Shoulder internal rotation / external rotation', 'Shoulder', 'Strength', 'InternalRotationExternalRotation', 'StandingElbow90Degrees90DegreeShoulderAbduction', 'Standing - Elbow 90 Degrees, 90 Degree Shoulder Abduction', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('shoulder-internal-rotation-external-rotation-supine-elbow-90-degrees-90-degree-shoulder-abduction', 'Shoulder internal rotation / external rotation', 'Shoulder', 'Strength', 'InternalRotationExternalRotation', 'SupineElbow90Degrees90DegreeShoulderAbduction', 'Supine - Elbow 90 Degrees, 90 Degree Shoulder Abduction', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('shoulder-internal-rotation-external-rotation-supine-elbow-90-degrees', 'Shoulder internal rotation / external rotation', 'Shoulder', 'Strength', 'InternalRotationExternalRotation', 'SupineElbow90Degrees', 'Supine - Elbow 90 Degrees', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('shoulder-extension-seated-long-lever', 'Shoulder extension', 'Shoulder', 'Strength', 'Extension', 'SeatedLongLever', 'Seated (Long Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Sitting off the edge of the table so that their arm being assessed remains at their side with their elbow extended and forearm in neutral, allowing the hand to hang down without contacting the table.
Contact point
Lateral aspect of the patient''s forearm, along the ulna, proximal to the wrist.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Seated adjacent to the patient, one hand supporting the DynaMo Plus resisting posterior force, the other supporting the patient, in contact with the anterior aspect of the patient''s shoulder.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742520925', 'vald', NULL, false, true, 'vald'),
('shoulder-extension-seated-short-lever', 'Shoulder extension', 'Shoulder', 'Strength', 'Extension', 'SeatedShortLever', 'Seated (Short Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Sitting off the end of the table with their arm being assessed at their side, elbow bent to 90 degrees and forearm in a pronated position.
Contact point
Posterior aspect of the patient''s upper arm, proximal to the elbow joint.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Seated adjacent to the patient, one hand supporting the DynaMo Plus resisting posterior force, the other supporting the patient to make sure they are not leaning backwards.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742520988', 'vald', NULL, false, true, 'vald'),
('shoulder-extension-standing-long-lever', 'Shoulder extension', 'Shoulder', 'Strength', 'Extension', 'StandingLongLever', 'Standing (Long Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Standing upright, with their arm being tested at their side and forearm in pronated, in front of a fixed surface.
Contact point
Anterior aspect of the forearm, just proximal to the wrist.
Device orientation
Horizontal, with the curved pad in contact with the patient and the flat pad in contact with a fixed surface.
Position of examiner
Standing next to the patient in position to place the DynaMo Plus, instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Flat pad and palm pad.', 'https://player.vimeo.com/video/742521331', 'vald', NULL, false, true, 'vald'),
('shoulder-extension-standing-short-lever', 'Shoulder extension', 'Shoulder', 'Strength', 'Extension', 'StandingShortLever', 'Standing (Short Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Standing with the arm being tested flexed to 90 degrees elbow flexion and wrist in neutral.
Contact point
Posterior aspect of the upper arm, just proximal to the elbow.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing behind the patient, on the same side as the arm being tested, supporting the DynaMo Plus in one hand and the patient''s shoulder with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742521226', 'vald', NULL, false, true, 'vald'),
('shoulder-extension-prone-long-lever', 'Shoulder extension', 'Shoulder', 'Strength', 'Extension', 'ProneLongLever', 'Prone (Long Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Prone on the table with the arm being tested by their side, elbow extended and forearm in a neutral position.
Contact point
Medial aspect of the patient''s forearm, just proximal to the hand.
Device orientation
Vertical, with the tester end up and palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing adjacent to the table on the side of the arm being tested, using both hands to support the DynaMo Plus and resisted superior force.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742520824', 'vald', NULL, false, true, 'vald'),
('shoulder-abduction-seated-long-lever', 'Shoulder abduction', 'Shoulder', 'Strength', 'Abduction', 'SeatedLongLever', 'Seated (Long Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Sitting off the edge of the bed with feet on the floor, their elbow straight and arm by their side, with their forearm in a neutral position.
Contact point
Distal aspect of the posterior forearm, just proximal to the wrist.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Sitting beside the patient, holding the DynaMo Plus with one hand, applying lateral pressure and supporting the patient to ensure they remain stable with the other hand.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742520125', 'vald', NULL, false, true, 'vald'),
('shoulder-abduction-seated-short-lever', 'Shoulder abduction', 'Shoulder', 'Strength', 'Abduction', 'SeatedShortLever', 'Seated (Short Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Sitting off the edge of the bed with feet on the floor, their arm straight and at their side, with their forearm in a neutral position.
Contact point
Distal aspect of the lateral upper arm, just proximal to the elbow.
Device orientation
Horizontal, with the palm pad supported and the curved pad in contact with the patient.
Position of examiner
Sitting beside the patient, holding the DynaMo Plus with one hand, applying lateral pressure and supporting the patient to ensure they remain stable with the other hand.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742520181', 'vald', NULL, false, true, 'vald'),
('shoulder-abduction-standing-ll', 'Shoulder abduction', 'Shoulder', 'Strength', 'Abduction', 'StandingLongLever', 'Standing (Long Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Standing with the arm being tested at the patient''s side with their elbow extended, and wrist in a neutral position.
Contact point
Posterior aspect of the forearm, just proximal to the wrist.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing on side of the patient''s arm that is being tested, with one hand supporting the DynaMo lus and the other hand supporting the patient''s opposite shoulder to ensure stability.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742520414', 'vald', NULL, true, true, 'vald'),
('shoulder-abduction-standing-sl', 'Shoulder abduction', 'Shoulder', 'Strength', 'Abduction', 'StandingShortLever', 'Standing (Short Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Standing with the arm being tested in 90 degrees shoulder abduction and elbow flexion, and wrist in a neutral position.
Contact point
Lateral aspect of the elbow.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing on side of the patient''s arm that is being tested, with one hand supporting the DynaMo Plus and the other hand supporting the patient''s opposite shoulder to ensure stability.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742520447', 'vald', NULL, true, true, 'vald'),
('shoulder-abduction-side-lying-long-lever', 'Shoulder abduction', 'Shoulder', 'Strength', 'Abduction', 'SideLyingLongLever', 'Side Lying (Long Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Side-lying on the arm that is not being tested, with both hips and knees bent to 45 degrees and the arm being tested fully extended by the patient''s side.
Contact point
Distal aspect of the posterior forearm, just proximal to the wrist.
Device orientation
Vertical, with tester end up, the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing next to the table, posterior to the patient, holding the DynaMo Plus with both hands.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742520083', 'vald', NULL, false, true, 'vald'),
('shoulder-abduction-side-lying-short-lever', 'Shoulder abduction', 'Shoulder', 'Strength', 'Abduction', 'SideLyingShortLever', 'Side Lying (Short Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Side-lying on the arm that is not being tested, with both hips and knees bent to 45 degrees and the arm being tested in 90 degrees elbow flexion.
Contact point
Lateral aspect of the upper arm, just proximal to the elbow.
Device orientation
Vertical, with the tester end up and palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing next to the table, posterior to the patient, holding the DynaMo Plus with both hands.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742520038', 'vald', NULL, false, true, 'vald'),
('shoulder-abduction-seated-90-degrees-shoulder-abduction-long-lever', 'Shoulder abduction', 'Shoulder', 'Strength', 'Abduction', 'Seated90DegreesShoulderAbductionLongLever', 'Seated - 90 Degrees Shoulder Abduction (Long Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Sitting off the edge of the bed with feet on the floor, their arm straight and abducted to 90 degrees, with their forearm in a pronated position.
Contact point
Posterior aspect of the forearm, just proximal to the wrist.
Device orientation
Vertical, with the tester end up and palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Sitting beside the patient, holding the DynaMo Plus with one hand, applying downward pressure and supporting the patient to ensure they remain stable with the other hand.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742520228', 'vald', NULL, false, true, 'vald'),
('shoulder-abduction-seated-90-degrees-shoulder-abduction-short-lever', 'Shoulder abduction', 'Shoulder', 'Strength', 'Abduction', 'Seated90DegreesShoulderAbductionShortLever', 'Seated - 90 Degrees Shoulder Abduction (Short Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Sitting off the edge of the bed with feet on the floor, their elbow bent to 90 degrees and arm abducted to 90 degrees, with their forearm in a neutral position.
Contact point
Distal aspect of the lateral upper arm, just proximal to the elbow.
Device orientation
Vertical, with the tester end up and palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Sitting beside the patient, holding the DynaMo Plus with one hand, applying downward pressure and supporting the patient to ensure they remain stable with the other hand.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742520264', 'vald', NULL, false, true, 'vald'),
('shoulder-adduction-seated-90-degrees-shoulder-abduction-long-lever', 'Shoulder adduction', 'Shoulder', 'Strength', 'Adduction', 'Seated90DegreesShoulderAbductionLongLever', 'Seated - 90 Degrees Shoulder Abduction (Long Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Seated adjacent to the table with their arm being tested above the table in 90 degrees shoulder abduction, elbow extended and forearm supinated.
Contact point
Anterior aspect of forearm, just proximal to wrist.
Device orientation
Vertical, tester end down and flat pad resting on the table, the curved pad in contact with the patient.
Position of examiner
Seated adjacent to the patient in a position to instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Flat pad and palm pad.', 'https://player.vimeo.com/video/744396307', 'vald', NULL, false, true, 'vald'),
('shoulder-adduction-seated-90-degrees-shoulder-abduction-short-lever', 'Shoulder adduction', 'Shoulder', 'Strength', 'Adduction', 'Seated90DegreesShoulderAbductionShortLever', 'Seated - 90 Degrees Shoulder Abduction (Short Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Seated adjacent to the table with their arm being tested above the table in 90 degrees shoulder abduction and elbow flexion.
Contact point
Medial elbow.
Device orientation
Vertical, tester end down and flat pad resting on the table, the curved pad in contact with the patient.
Position of examiner
Seated adjacent to the patient in place to position the DynaMo Plus and instruct the movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Flat pad and palm pad.', 'https://player.vimeo.com/video/744396362', 'vald', NULL, false, true, 'vald'),
('shoulder-adduction-standing-long-lever', 'Shoulder adduction', 'Shoulder', 'Strength', 'Adduction', 'StandingLongLever', 'Standing (Long Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Standing with the arm being tested in just enough abduction to allow for the DynaMo Plus to be situated between the patient''s wrist, in a neutral position, and their ipsilateral hip.
Contact point
Anterior aspect of the forearm, just proximal to the wrist.
Device orientation
Horizontal, with the palm pad in contact with the lateral aspect of the patient''s hip and the curved pad in contact with the patient''s forearm.
Position of examiner
Seated on side of the patient''s arm that is being tested, in place to position the DynaMo Plus and instruct the patient.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742520658', 'vald', NULL, false, true, 'vald'),
('shoulder-adduction-standing-short-lever', 'Shoulder adduction', 'Shoulder', 'Strength', 'Adduction', 'StandingShortLever', 'Standing (Short Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Standing with the arm being tested bent to 90 degrees elbow flexion, and in just enough abduction to allow for the DynaMo Plus to be situated between the patient''s elbow, and the lateral aspect of their torso superior to their ipsilateral hip.
Contact point
Medial elbow.
Device orientation
Diagonal, with the tester end down, palm pad supported by the practitioner''s hand and in contact with the lateral aspect of the patient''s torso and the curved pad in contact with the patient''s medial elbow.
Position of examiner
Standing on side of the patient''s arm that is being tested, using one hand to support the DynaMo Plus.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742520718', 'vald', NULL, false, true, 'vald'),
('shoulder-adduction-abduction-seated-long-lever', 'Shoulder adduction / abduction', 'Shoulder', 'Strength', 'AdductionAbduction', 'SeatedLongLever', 'Seated (Long Lever)', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('shoulder-adduction-abduction-seated-short-lever', 'Shoulder adduction / abduction', 'Shoulder', 'Strength', 'AdductionAbduction', 'SeatedShortLever', 'Seated (Short Lever)', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('shoulder-adduction-abduction-standing-long-lever', 'Shoulder adduction / abduction', 'Shoulder', 'Strength', 'AdductionAbduction', 'StandingLongLever', 'Standing (Long Lever)', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('shoulder-adduction-abduction-standing-short-lever', 'Shoulder adduction / abduction', 'Shoulder', 'Strength', 'AdductionAbduction', 'StandingShortLever', 'Standing (Short Lever)', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('shoulder-scaption-seated', 'Shoulder scaption', 'Shoulder', 'Strength', 'Scaption', 'Seated', 'Seated', 'Bilateral', 'force', 0, false, 'Patient position
Sitting off the edge of the bed with feet on the floor, their arm straight by their side, with their shoulder slightly externally rotated and forearm slightly supinated as if they were about to elevate their arm in the scapular plane.
Contact point
Lateral / radial aspect of the forearm, just proximal to the wrist.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Sitting beside the patient, holding the DynaMo Plus with one hand, applying posterolateral pressure and supporting the patient to ensure they remain stable with the other hand.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742535724', 'vald', NULL, false, true, 'vald'),
('shoulder-scaption-standing', 'Shoulder scaption', 'Shoulder', 'Strength', 'Scaption', 'Standing', 'Standing', 'Bilateral', 'force', 0, false, 'Patient position
Standing with the arm being tested at the patient''s side, elbow extended and forearm slightly supinated.
Contact point
Lateral aspect of the forearm, at the radiol styloid process.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Seated adjacent to the patient, on the same side as the arm being tested, supporting the DynaMo Plus in one hand and the patient with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742535761', 'vald', NULL, false, true, 'vald'),
('shoulder-flexion-seated-long-lever', 'Shoulder flexion', 'Shoulder', 'Strength', 'Flexion', 'SeatedLongLever', 'Seated (Long Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Sitting off the edge of the bed with feet on the floor, their arm straight by their side, with their forearm in a neutral position.
Contact point
Lateral / radial aspect of the forearm, just proximal to the wrist.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Sitting beside the patient, holding the DynaMo Plus with one hand, applying lateral pressure and supporting the patient to ensure they remain stable with the other hand.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742533496', 'vald', NULL, false, true, 'vald'),
('shoulder-flexion-seated-short-lever', 'Shoulder flexion', 'Shoulder', 'Strength', 'Flexion', 'SeatedShortLever', 'Seated (Short Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Sitting off the edge of the bed with feet on the floor, their elbow bent and arm by their side, with their forearm in a neutral position.
Contact point
Anterior aspect of the upper arm, just proximal to the elbow.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Sitting beside the patient, holding the DynaMo Plus with one hand, applying posterior pressure and supporting the patient to ensure they remain stable with the other hand.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742533623', 'vald', NULL, false, true, 'vald'),
('shoulder-flexion-standing-long-lever', 'Shoulder flexion', 'Shoulder', 'Strength', 'Flexion', 'StandingLongLever', 'Standing (Long Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Standing upright, with their arm being tested at their side and forearm in a neutral position, facing a fixed surface.
Contact point
Lateral aspect of the forearm, just proximal to the wrist.
Device orientation
Horizontal, with the curved pad in contact with the patient and the flat pad in contact with a fixed surface.
Position of examiner
Standing next to the patient in position to place the DynaMo Plus, instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Flat pad and palm pad.', 'https://player.vimeo.com/video/742533864', 'vald', NULL, false, true, 'vald'),
('shoulder-flexion-standing-short-lever', 'Shoulder flexion', 'Shoulder', 'Strength', 'Flexion', 'StandingShortLever', 'Standing (Short Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Standing upright, with their arm being tested at their side, elbow flexed to 90 degrees, and forearm in a neutral position, facing a fixed surface.
Contact point
Posterior aspect of the proximal phalanges, hand in clenched fist.
Device orientation
Horizontal, with the curved pad in contact with the patient and the flat pad in contact with a fixed surface.
Position of examiner
Standing next to the patient in position to place the DynaMo Plus, instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Flat pad and palm pad.', 'https://player.vimeo.com/video/742533973', 'vald', NULL, false, true, 'vald'),
('shoulder-flexion-seated-90-degree-shoulder-flexion', 'Shoulder flexion', 'Shoulder', 'Strength', 'Flexion', 'Seated90DegreeShoulderFlexion', 'Seated - 90 Degree Shoulder Flexion', 'Bilateral', 'force', 0, false, 'Patient position
Seated on a chair with the shoulder of the arm being tested at 90 degrees flexion, elbow extended and forearm in a pronated position.
Contact point
Hand attachment, gripped in a vertical position.
Device orientation
Horizontal, linked to the hand attachment at one end and anchored to a fixed surface by the cable strap at the other, inferior to the patient''s arm being tested.
Position of examiner
Seated next to the patient in a position to orientate the DynaMo Plus, instruct and demonstrate the movement.
Instruction
Pull against the DynaMo Plus as hard as you can. 3, 2, 1 - pull, pull, pull and relax.
Attachments
Hand attachment and cable strap.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-flexion-standing-90-degree-shoulder-flexion', 'Shoulder flexion', 'Shoulder', 'Strength', 'Flexion', 'Standing90DegreeShoulderFlexion', 'Standing - 90 Degree Shoulder Flexion', 'Bilateral', 'force', 0, false, 'Patient position
Standing, with the arm being tested at 90 degrees shoulder flexion, elbow extended and forearm pronated.
Contact point
Hand attachment held in the patient''s hand.
Device orientation
Vertical, connected to the hand attachment at one end and attached to a fixed surface inferior to the patient''s arm at the other.
Position of examiner
Standing next to the patient in position to instruct and demonstrate the movement.
Instruction
Pull against the DynaMo Plus as hard as you can. 3, 2, 1 - pull, pull, pull and relax.
Attachments
Hand attachment.', 'https://player.vimeo.com/video/742534194', 'vald', NULL, false, true, 'vald'),
('shoulder-flexion-supine-long-lever', 'Shoulder flexion', 'Shoulder', 'Strength', 'Flexion', 'SupineLongLever', 'Supine (Long Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Supine, with the arm being assessed by the patient''s side in full extension and forearm in a neutral position.
Contact point
Distal aspect of the lateral forearm, just proximal to the wrist.
Device orientation
Vertical, the tester end up with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing next to the table, holding the DynaMo Plus with both hands.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742534251', 'vald', NULL, false, true, 'vald'),
('shoulder-flexion-supine-short-lever', 'Shoulder flexion', 'Shoulder', 'Strength', 'Flexion', 'SupineShortLever', 'Supine (Short Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Supine, with the arm being assessed by the patient''s side in 90 degrees elbow flexion and forearm in a neutral position.
Contact point
Distal aspect of the anterior upper arm, just proximal to the elbow.
Device orientation
Vertical, the tester end up with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing next to the table, holding the DynaMo Plus with both hands.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742534313', 'vald', NULL, false, true, 'vald'),
('shoulder-flexion-extension-seated-long-lever', 'Shoulder flexion / extension', 'Shoulder', 'Strength', 'FlexionExtension', 'SeatedLongLever', 'Seated (Long Lever)', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('shoulder-flexion-extension-seated-short-lever', 'Shoulder flexion / extension', 'Shoulder', 'Strength', 'FlexionExtension', 'SeatedShortLever', 'Seated (Short Lever)', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('shoulder-flexion-extension-standing-long-lever', 'Shoulder flexion / extension', 'Shoulder', 'Strength', 'FlexionExtension', 'StandingLongLever', 'Standing (Long Lever)', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('shoulder-flexion-extension-standing-short-lever', 'Shoulder flexion / extension', 'Shoulder', 'Strength', 'FlexionExtension', 'StandingShortLever', 'Standing (Short Lever)', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('shoulder-isoitest-supine', 'Shoulder iso i test', 'Shoulder', 'Strength', 'ISOITest', 'Supine', 'Supine', 'Bilateral', 'force', 0, false, 'Patient position
Supine with the arm being tested abducted to 180 degrees with the forearm supinated, and the contralateral arm related to the patient''s side.
Contact point
Held in the patient''s hand.
Device orientation
Vertical, consistent with the position of the patient''s hand.
Position of examiner
Kneeling adjacent to the patient in a position to instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Handstrap.', 'https://player.vimeo.com/video/742535524', 'vald', NULL, false, true, 'vald'),
('shoulder-isoitest-prone', 'Shoulder iso i test', 'Shoulder', 'Strength', 'ISOITest', 'Prone', 'Prone', 'Bilateral', 'force', 0, false, 'Patient position
Prone, with the arm being tested abducted to 180 degrees with the forearm supinated, and the contralateral arm relaxed at the patient''s side, with support under their forehead.
Contact point
Held in the patient''s hand.
Device orientation
Vertical, consistent with the position of the patient''s hand.
Position of examiner
Kneeling adjacent to the patient in a position to instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Handstrap.', 'https://player.vimeo.com/video/742535489', 'vald', NULL, false, true, 'vald'),
('shoulder-isoytest-supine', 'Shoulder iso y test', 'Shoulder', 'Strength', 'ISOYTest', 'Supine', 'Supine', 'Bilateral', 'force', 0, false, 'Patient position
Supine, with the arm being tested abducted to 135 degrees with the forearm supinated, and the contralateral arm related to the patient''s side.
Contact point
Held in the patient''s hand.
Device orientation
Vertical, consistent with the position of the patient''s hand.
Position of examiner
Kneeling adjacent to the patient in a position to instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Handstrap.', 'https://player.vimeo.com/video/742535690', 'vald', NULL, false, true, 'vald'),
('shoulder-isoytest-prone', 'Shoulder iso y test', 'Shoulder', 'Strength', 'ISOYTest', 'Prone', 'Prone', 'Bilateral', 'force', 0, false, 'Patient position
Prone, with the arm being tested abducted to 135 degrees with the forearm supinated, and the contralateral hand behind the patient''s back, with support under their forehead.
Contact point
Held in the patient''s hand.
Device orientation
Vertical, consistent with the position of the patient''s head.
Position of examiner
Kneeling adjacent to the patient in a position to instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Handstrap.', 'https://player.vimeo.com/video/742535642', 'vald', NULL, false, true, 'vald'),
('shoulder-isottest-supine', 'Shoulder iso t test', 'Shoulder', 'Strength', 'ISOTTest', 'Supine', 'Supine', 'Bilateral', 'force', 0, false, 'Patient position
Supine, with the arm being tested abducted to 90 degrees with the forearm supinated, and the contralateral arm related to the patient''s side.
Contact point
Held in the patient''s hand.
Device orientation
Vertical, consistent with the position of the patient''s head.
Position of examiner
Kneeling adjacent to the patient in a position to instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Handstrap.', 'https://player.vimeo.com/video/742535561', 'vald', NULL, false, true, 'vald'),
('shoulder-isottest-prone', 'Shoulder iso t test', 'Shoulder', 'Strength', 'ISOTTest', 'Prone', 'Prone', 'Bilateral', 'force', 0, false, 'Patient position
Prone, with the arm being tested abducted to 90 degrees with the forearm supinated, and the contralateral hand behind the patient''s back, with support under their forehead.
Contact point
Held in the patient''s hand.
Device orientation
Vertical, consistent with the position of the patient''s head.
Position of examiner
Kneeling adjacent to the patient in a position to instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Handstrap.', 'https://player.vimeo.com/video/742535603', 'vald', NULL, false, true, 'vald'),
('shoulder-internal-rotation-seated-elbow-90-degrees-rom', 'Shoulder internal rotation ROM', 'Shoulder', 'RangeofMotion', 'InternalRotation', 'SeatedElbow90Degrees', 'Seated - Elbow 90 Degrees', 'Bilateral', 'rom', 0, false, 'Patient position
Sitting off the end of the table with their arm being assessed at their side, elbow bent to 90 degrees and forearm in a neutral position.
Contact point
Held in patient''s hand.
Device orientation
Vertical, consistent with the position of the patient''s hand.
Position of examiner
Seated adjacent to the patient, on the same side as the arm being tested, in a position to instruct and demonstrate the movement.
Instruction
Rotate your arm inwards as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
No attachment.', 'https://player.vimeo.com/video/742534772', 'vald', NULL, false, true, 'vald'),
('shoulder-external-rotation-seated-elbow-90-degrees-rom', 'Shoulder external rotation ROM', 'Shoulder', 'RangeofMotion', 'ExternalRotation', 'SeatedElbow90Degrees', 'Seated - Elbow 90 Degrees', 'Bilateral', 'rom', 0, false, 'Patient position
Sitting off the end of the table with their arm being assessed at their side, elbow bent to 90 degrees and forearm in a neutral position.
Contact point
Held in patient''s hand.
Device orientation
Vertical, consistent with the position of the patient''s hand.
Position of examiner
Seated adjacent to the patient, on the same side as the arm being tested, in a position to instruct and demonstrate the movement.
Instruction
Rotate your arm inwards as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
No attachment.', 'https://player.vimeo.com/video/742537955', 'vald', NULL, false, true, 'vald'),
('shoulder-internal-rotation-external-rotation-seated-elbow-90-degrees-rom', 'Shoulder internal rotation / external rotation ROM', 'Shoulder', 'RangeofMotion', 'InternalRotationExternalRotation', 'SeatedElbow90Degrees', 'Seated - Elbow 90 Degrees', 'Bilateral', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('shoulder-flexion-rom', 'Shoulder flexion ROM', 'Shoulder', 'RangeofMotion', 'Flexion', 'Standing', 'Standing', 'Bilateral', 'rom', 0, false, 'Patient position
Standing with the arm being tested resting at patient''s side with elbow extended and forearm in neutral.
Contact point
Held in patient''s hand.
Device orientation
Horizontal, consistent with the position of the patient''s hand.
Position of examiner
Standing adjacent to the patient in position to instruct and demonstrate the movement.
Instruction
Flex your shoulder as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
No attachment.', 'https://player.vimeo.com/video/742534155', 'vald', NULL, true, true, 'vald'),
('shoulder-extension-rom', 'Shoulder extension ROM', 'Shoulder', 'RangeofMotion', 'Extension', 'Standing', 'Standing', 'Bilateral', 'rom', 0, false, 'Patient position
Standing with the arm being tested resting at patient''s side with elbow extended and forearm in neutral.
Contact point
Held in patient''s hand.
Device orientation
Horizontal, consistent with the position of the patient''s hand.
Position of examiner
Standing adjacent to the patient in position to instruct and demonstrate the movement.
Instruction
Extend your shoulder as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
No attachment.', 'https://player.vimeo.com/video/742521164', 'vald', NULL, true, true, 'vald'),
('shoulder-flexion-extension-seated-elbow-90-degrees-rom', 'Shoulder flexion / extension ROM', 'Shoulder', 'RangeofMotion', 'FlexionExtension', 'SeatedElbow90Degrees', 'Seated - Elbow 90 Degrees', 'Bilateral', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('shoulder-flexion-extension-standing-rom', 'Shoulder flexion / extension ROM', 'Shoulder', 'RangeofMotion', 'FlexionExtension', 'Standing', 'Standing', 'Bilateral', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('shoulder-abduction-rom', 'Shoulder abduction ROM', 'Shoulder', 'RangeofMotion', 'Abduction', 'Standing', 'Standing', 'Bilateral', 'rom', 0, false, 'Patient position
Standing with the arm being tested resting at patient''s side with elbow extended and forearm supinated.
Contact point
Held in patient''s hand.
Device orientation
Horizontal, consistent with the position of the patient''s hand.
Position of examiner
Standing adjacent to the patient in position to instruct and demonstrate the movement.
Instruction
Abduct your shoulder as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
Hand strap.', 'https://player.vimeo.com/video/742520387', 'vald', NULL, true, true, 'vald'),
('shoulder-horizontal-abduction-seated-rom', 'Shoulder horizontal abduction ROM', 'Shoulder', 'RangeofMotion', 'HorizontalAbduction', 'Seated', 'Seated', 'Bilateral', 'rom', 0, false, 'Patient position
Sitting at the edge of the table with their arm being assessed in 90 degrees shoulder flexion, elbow extended and forearm in a pronated position.
Contact point
Held in patient''s hand.
Device orientation
Horizontal, consistent with the position of the patient''s hand.
Position of examiner
Standing adjacent to the patient in position to instruct and demonstrate the movement.
Instruction
Move your shoulder away from your body as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
No attachment.', 'https://player.vimeo.com/video/742534360', 'vald', NULL, false, true, 'vald'),
('shoulder-horizontal-abduction-standing-rom', 'Shoulder horizontal abduction ROM', 'Shoulder', 'RangeofMotion', 'HorizontalAbduction', 'Standing', 'Standing', 'Bilateral', 'rom', 0, false, 'Patient position
Standing with the arm being tested in 90 degrees shoulder flexion, elbow extension and forearm pronated.
Contact point
Held in patient''s hand.
Device orientation
Horizontal, consistent with the position of the patient''s hand.
Position of examiner
Standing adjacent to the patient in position to instruct and demonstrate the movement.
Instruction
Move your shoulder away from your body as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
No attachment.', 'https://player.vimeo.com/video/742534484', 'vald', NULL, false, true, 'vald'),
('shoulder-horizontal-adduction-seated-rom', 'Shoulder horizontal adduction ROM', 'Shoulder', 'RangeofMotion', 'HorizontalAdduction', 'Seated', 'Seated', 'Bilateral', 'rom', 0, false, 'Patient position
Sitting at the edge of the table with their arm being assessed in 90 degrees shoulder flexion, elbow extended and forearm in a pronated position.
Contact point
Held in patient''s hand.
Device orientation
Horizontal, consistent with the position of the patient''s hand.
Position of examiner
Seated adjacent to the patient, on the same side as the arm being tested, in a position to instruct and demonstrate the movement.
Instruction
Move your shoulder towards your body as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
No attachment.', 'https://player.vimeo.com/video/742521557', 'vald', NULL, false, true, 'vald'),
('shoulder-horizontal-adduction-standing-rom', 'Shoulder horizontal adduction ROM', 'Shoulder', 'RangeofMotion', 'HorizontalAdduction', 'Standing', 'Standing', 'Bilateral', 'rom', 0, false, 'Patient position
Standing with the arm being tested in 90 degrees shoulder flexion, elbow extension and forearm pronated.
Contact point
Held in patient''s hand.
Device orientation
Horizontal, consistent with the position of the patient''s hand.
Position of examiner
Standing adjacent to the patient in position to instruct and demonstrate the movement.
Instruction
Move your shoulder towards your body as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
No attachment.', 'https://player.vimeo.com/video/742534601', 'vald', NULL, false, true, 'vald'),
('shoulder-horizontal-abduction-adduction-seated-rom', 'Shoulder horizontal abduction/adduction ROM', 'Shoulder', 'RangeofMotion', 'HorizontalAbductionAdduction', 'Seated', 'Seated', 'Bilateral', 'rom', 0, false, NULL, NULL, NULL, NULL, false, true, 'vald'),
('shoulder-horizontal-abduction-adduction-standing-rom', 'Shoulder horizontal abduction/adduction ROM', 'Shoulder', 'RangeofMotion', 'HorizontalAbductionAdduction', 'Standing', 'Standing', 'Bilateral', 'rom', 0, false, NULL, NULL, NULL, NULL, false, true, 'vald'),
('trunk-flexion-seated', 'Trunk flexion', 'Trunk', 'Strength', 'Flexion', 'Seated', 'Seated', 'None', 'force', 0, false, 'Patient position
Sitting off the edge of the bed with feet on the floor, their arms by their sides and hands rested flat on their thighs.
Contact point
At the midpoint of the manubrium.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Sitting beside the patient, holding the DynaMo Plus with one hand, applying posterior pressure and supporting the patient to ensure they remain stable with the other hand.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742536087', 'vald', NULL, false, true, 'vald'),
('trunk-lateral-flexion-left-seated', 'Trunk lateral flexion (left)', 'Trunk', 'Strength', 'LateralFlexionLeft', 'Seated', 'Seated', 'None', 'force', 0, false, 'Patient position
Sitting off the edge of the bed with feet on the floor, their arms crossed and hands placed on the opposite shoulder.
Contact point
On the lateral aspect of the rib cage, just inferior to the shoulder along the mid-axillary line.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Seated beside the patient, holding the DynaMo Plus with one hand, applying lateral pressure and stabilizing the patient''s opposite hip with the other hand.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742536168', 'vald', NULL, false, true, 'vald'),
('trunk-lateral-flexion-right-seated', 'Trunk lateral flexion (right)', 'Trunk', 'Strength', 'LateralFlexionRight', 'Seated', 'Seated', 'None', 'force', 0, false, 'Patient position
Sitting off the edge of the bed with feet on the floor, their arms crossed and hands placed on the opposite shoulder.
Contact point
On the lateral aspect of the rib cage, just inferior to the shoulder along the mid-axillary line.
Device orientation
Horizontal, with the palm pad supported by the assessor and the curved pad in contact with the patient.
Position of examiner
Seated beside the patient, holding the DynaMo Plus with one hand, applying lateral pressure and stabilizing the patient''s opposite hip with the other hand.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742536254', 'vald', NULL, false, true, 'vald'),
('trunk-flexion-seated-rom', 'Trunk flexion ROM', 'Trunk', 'RangeofMotion', 'Flexion', 'Seated', 'Seated', 'None', 'rom', 0, false, 'Patient position
Sitting on the edge of the bed, with arms supporting DynaMo Plus on chest.
Contact point
DynaMo Plus supported on sternum.
Device orientation
Vertical, aligned with sternum.
Position of examiner
Seated adjacent to patient, in position to assess quality of movement.
Instruction
Slump down, bringing your shoulders towards your hips.
Attachments
None.', 'https://player.vimeo.com/video/742536141', 'vald', NULL, false, true, 'vald'),
('trunk-extension-seated-rom', 'Trunk extension ROM', 'Trunk', 'RangeofMotion', 'Extension', 'Seated', 'Seated', 'None', 'rom', 0, false, 'Patient position
Sitting on the edge of the bed, with arms supporting the DynaMo Plus on chest.
Contact point
DynaMo Plus supported on sternum.
Device orientation
Vertical, aligned with sternum.
Position of examiner
Seated adjacent to patient, in position to assess quality of movement.
Instruction
Push your chest and extend your shoulders backwards.
Attachments
None.', 'https://player.vimeo.com/video/742536056', 'vald', NULL, false, true, 'vald'),
('trunk-rotation-left-seated-rom', 'Trunk rotation (left) ROM', 'Trunk', 'RangeofMotion', 'RotationLeft', 'Seated', 'Seated', 'None', 'rom', 0, false, 'Patient position
Sitting on the edge of the bed, with dowel supporting the DynaMo Plus on their chest.
Contact point
DynaMo Plus affixed to dowel using ROM strap.
Device orientation
Horizontal, in line with dowel.
Position of examiner
Seated in a position to assess quality of movement.
Instruction
Rotate your trunk to the left as far as you can, keeping the rest of your body still.
Attachments
ROM strap, dowel.', 'https://player.vimeo.com/video/742536302', 'vald', NULL, false, true, 'vald'),
('trunk-rotation-right-seated-rom', 'Trunk rotation (right) ROM', 'Trunk', 'RangeofMotion', 'RotationRight', 'Seated', 'Seated', 'None', 'rom', 0, false, 'Patient position
Sitting on the edge of the bed, with dowel supporting the DynaMo Plus on their chest.
Contact point
DynaMo Plus affixed to dowel using ROM strap.
Device orientation
Horizontal, in line with dowel.
Position of examiner
Seated in a position to assess quality of movement.
Instruction
Rotate your trunk to the right as far as you can, keeping the rest of your body still.
Attachments
ROM strap, dowel.', 'https://player.vimeo.com/video/742536343', 'vald', NULL, false, true, 'vald'),
('trunk-lateral-flexion-left-seated-rom', 'Trunk lateral flexion (left) ROM', 'Trunk', 'RangeofMotion', 'LateralFlexionLeft', 'Seated', 'Seated', 'None', 'rom', 0, false, 'Patient position
Sitting on the edge of the bed, with dowel supporting DynaMo Plus behind their back.
Contact point
DynaMo Plus affixed to dowel using ROM strap.
Device orientation
Horizontal, in line with dowel.
Position of examiner
Seated in a position to assess quality of movement.
Instruction
Bring your shoulder down towards your hip as far as possible.
Attachments
ROM strap, dowel.', 'https://player.vimeo.com/video/742536212', 'vald', NULL, false, true, 'vald'),
('trunk-lateral-flexion-right-seated-rom', 'Trunk lateral flexion (right) ROM', 'Trunk', 'RangeofMotion', 'LateralFlexionRight', 'Seated', 'Seated', 'None', 'rom', 0, false, 'Patient position
Sitting on the edge of the bed, with dowel supporting DynaMo Plus behind their back.
Contact point
DynaMo Plus affixed to dowel using ROM strap.
Device orientation
Horizontal, in line with dowel.
Position of examiner
Seated in a position to assess quality of movement.
Instruction
Bring your shoulder down towards your hip as far as possible.
Attachments
ROM strap, dowel.', 'https://player.vimeo.com/video/742536212', 'vald', NULL, false, true, 'vald'),
('hip-extension-standing-long-lever', 'Hip extension', 'Hip', 'Strength', 'Extension', 'StandingLongLever', 'Standing (Long Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Standing with both hands in contact with a fixed surface in front of them for support and the leg being tested in full extension, standing on their opposite leg.
Contact point
Posterior aspect of the patient''s lower leg, just proximal to the ankle.
Device orientation
Horizontal, with the practitioner supporting the palm pad and the curved pad in contact with the patient.
Position of examiner
Kneeling behind the patient, supporting the DynaMo Plus with one hand and supporting the patient with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742501285', 'vald', NULL, false, true, 'vald'),
('hip-extension-standing-short-lever', 'Hip extension', 'Hip', 'Strength', 'Extension', 'StandingShortLever', 'Standing (Short Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Standing with both hands in contact with a fixed surface in front of them for support and the leg being tested bent to 90 degrees knee flexion, standing on their opposite leg.
Contact point
Posterior aspect of the patient''s thigh, just proximal to the knee.
Device orientation
Horizontal, with the practitioner supporting the palm pad and the curved pad in contact with the patient.
Position of examiner
Kneeling behind the patient, supporting the DynaMo Plus with both hands.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', NULL, NULL, NULL, false, true, 'vald'),
('hip-extension-prone-long-lever', 'Hip extension', 'Hip', 'Strength', 'Extension', 'ProneLongLever', 'Prone (Long Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Prone on the table with leg being tested in full extension.
Contact point
Posterior aspect of the patient''s lower leg, just proximal to the ankle.
Device orientation
Vertical, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing adjacent to the table on the side of the tested leg, with two hands supporting the DynaMo Plus and resisting upward force.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742501060', 'vald', NULL, false, true, 'vald'),
('hip-extension-prone-short-lever', 'Hip extension', 'Hip', 'Strength', 'Extension', 'ProneShortLever', 'Prone (Short Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Prone on the table with leg being tested in 90 degrees of knee flexion.
Contact point
Posterior aspect of the patient''s thigh, just proximal to the knee.
Device orientation
Vertical, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing adjacent to the table on the side of the tested leg, with two hands supporting the DynaMo Plus and resisting upward force.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742501099', 'vald', NULL, false, true, 'vald'),
('hip-extension-prone-90-degree-knee-flexion', 'Hip extension', 'Hip', 'Strength', 'Extension', 'Prone90DegreeKneeFlexion', 'Prone - 90 Degree Knee Flexion', 'Bilateral', 'force', 0, false, 'Patient position
Prone on the table with leg being tested in 90 degrees of knee flexion.
Contact point
Plantar aspect of the patient''s foot, just anterior to calcaneous.
Device orientation
Vertical, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing adjacent to the table on the side of the tested leg, with two hands supporting the DynaMo Plus and resisting upward force.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742501025', 'vald', NULL, false, true, 'vald'),
('hip-extension-semi-prone', 'Hip extension', 'Hip', 'Strength', 'Extension', 'SemiProne', 'Semi - Prone', 'Bilateral', 'force', 0, false, 'Patient position
Patient lying in a semi-prone position, with the leg being tested in 90 degree knee flexion and end range hip extension, and the foot of the opposite leg touching the floor and patient''s body from hip crease upwards in contact with the table.
Contact point
Posterior thigh, just proximal to the knee.
Device orientation
Perpendicular to the patient''s thigh, with the tester end up and the load end in contact with the patient.
Position of examiner
Adjacent to the patient, stabilizing the DynaMo Plus with both hands.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742501214', 'vald', NULL, false, true, 'vald'),
('hip-flexion-standing', 'Hip flexion', 'Hip', 'Strength', 'Flexion', 'Standing', 'Standing', 'Bilateral', 'force', 0, false, 'Patient position
Standing with their contralateral hand in contact with a fixed surface for support, leg being tested bent to 90 degrees knee flexion and standing on their opposite leg.
Contact point
Anterior aspect of the patient''s thigh, just proximal to the knee.
Device orientation
Horizontal, with the practitioner supporting the palm pad and the curved pad in contact with the patient.
Position of examiner
Kneeling in front of the patient, supporting the DynaMo Plus with one hand and the patient with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742501795', 'vald', NULL, false, true, 'vald'),
('hip-flexion-supine', 'Hip flexion', 'Hip', 'Strength', 'Flexion', 'Supine', 'Supine', 'Bilateral', 'force', 0, false, 'Patient position
Supine on the table with the leg being tested in full extension and the opposite leg bent in a hook-lying position.
Contact point
Posterior aspect of the patient''s thigh, just proximal to the knee.
Device orientation
Vertical, the tester end up with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing besides the table with two hands supporting the DynaMo Plus.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742501897', 'vald', NULL, false, true, 'vald'),
('hip-flexion-seated', 'Hip flexion', 'Hip', 'Strength', 'Flexion', 'Seated', 'Seated', 'Bilateral', 'force', 0, false, 'Patient position
Sitting off the edge of the bed with feet not touching the floor, their arms crossed and hands placed on the opposite shoulder.
Contact point
On the distal anterior thigh, just proximal to the patella.
Device orientation
Vertical, with the tester end up and palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing beside the patient, using both hands to hold the DynaMo Plus, applying downward pressure.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742501719', 'vald', NULL, false, true, 'vald'),
('hip-flexion-extension-standing', 'Hip flexion / extension', 'Hip', 'Strength', 'FlexionExtension', 'Standing', 'Standing', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('hip-internal-rotation-seated', 'Hip internal rotation', 'Hip', 'Strength', 'InternalRotation', 'Seated', 'Seated', 'Bilateral', 'force', 0, false, 'Patient position
Sitting off the end of the table with their hips and knees both at 90 degrees flexion.
Contact point
Lateral aspect of the patient''s lower leg, just proximal to the lateral malleolus.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Seated or kneeling in front of the patient, lateral to the leg being tested, with one hand supporting the DynaMo Plus and resisting lateral force, with the other hand supporting the patient''s upper leg to ensure minimal movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742502038', 'vald', NULL, false, true, 'vald'),
('hip-internal-rotation-supine', 'Hip internal rotation', 'Hip', 'Strength', 'InternalRotation', 'Supine', 'Supine', 'Bilateral', 'force', 0, false, 'Patient position
Supine on the table with leg being tested in 90 degrees hip and knee flexion.
Contact point
Lateral aspect of the patient''s lower leg, just proximal to the lateral malleolus.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing besides the table with one hand supporting the DynaMo Plus and the other supporting the patient''s leg, just proximal to their knee.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742502323', 'vald', NULL, false, true, 'vald'),
('hip-internal-rotation-prone', 'Hip internal rotation', 'Hip', 'Strength', 'InternalRotation', 'Prone', 'Prone', 'Bilateral', 'force', 0, false, 'Patient position
Prone on the table with the leg being tested in 90 degrees of knee flexion.
Contact point
Lateral aspect of the patient''s lower leg, just proximal to the lateral malleolus.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing adjacent to the table on the side of the tested leg, hand supporting the DynaMo Plus and resisting.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742501980', 'vald', NULL, false, true, 'vald'),
('hip-external-rotation-seated', 'Hip external rotation', 'Hip', 'Strength', 'ExternalRotation', 'Seated', 'Seated', 'Bilateral', 'force', 0, false, 'Patient position
Sitting off the end of the table with their hips and knees both at 90 degrees flexion.
Contact point
Lateral aspect of the patient''s lower leg, just proximal to the medial malleolus.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Seated or kneeling in front of the patient, lateral to the leg being tested, with one hand supporting the DynaMo Plus and resisting lateral force, with the other hand supporting the patient''s upper leg to ensure minimal movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742501436', 'vald', NULL, false, true, 'vald'),
('hip-external-rotation-supine', 'Hip external rotation', 'Hip', 'Strength', 'ExternalRotation', 'Supine', 'Supine', 'Bilateral', 'force', 0, false, 'Patient position
Supine on the table with leg being tested in 90 degrees hip and knee flexion.
Contact point
Medial aspect of the patient''s lower leg, just proximal to the medial malleolus.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing besides the table with one hand supporting the DynaMo Plus and the other supporting the patient''s leg, just proximal to their knee.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742501571', 'vald', NULL, false, true, 'vald'),
('hip-external-rotation-prone', 'Hip external rotation', 'Hip', 'Strength', 'ExternalRotation', 'Prone', 'Prone', 'Bilateral', 'force', 0, false, 'Patient position
Prone on the table with leg being tested in 90 degrees of knee flexion.
Contact point
Medial aspect of the patient''s lower leg, just proximal to the lateral malleolus.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing adjacent to the table on the side of the tested leg, hand supporting the DynaMo Plus and resisting.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742501370', 'vald', NULL, false, true, 'vald'),
('hip-internal-rotation-external-rotation-seated', 'Hip internal rotation / external rotation', 'Hip', 'Strength', 'InternalRotationExternalRotation', 'Seated', 'Seated', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('hip-internal-rotation-external-rotation-supine', 'Hip internal rotation / external rotation', 'Hip', 'Strength', 'InternalRotationExternalRotation', 'Supine', 'Supine', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('hip-internal-rotation-external-rotation-prone', 'Hip internal rotation / external rotation', 'Hip', 'Strength', 'InternalRotationExternalRotation', 'Prone', 'Prone', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('hip-adduction-supine', 'Hip adduction', 'Hip', 'Strength', 'Adduction', 'Supine', 'Supine', 'Bilateral', 'force', 0, false, 'Patient position
Supine on the table with leg being tested in full extension and opposite leg in a hook-lying position.
Contact point
Medial aspect of the patient''s lower leg, just proximal to the medial malleolus.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing besides the table with one hand supporting the DynaMo Plus and the other supporting the patient''s leg, just proximal to the hip of their leg being tested.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742500694', 'vald', NULL, false, true, 'vald'),
('hip-adduction-supine-knees-45-degrees', 'Hip adduction', 'Hip', 'Strength', 'Adduction', 'SupineKnees45Degrees', 'Supine - Knees 45 Degrees', 'Bilateral', 'force', 0, false, 'Patient Position
Supine on the table with the leg being tested at 45 degrees of knee flexion in a hook-lying position and the opposite leg fully extended.
Contact Point
Lateral aspect of the patient''s lower leg, just proximal to the lateral malleolus.
Device Orientation
Horizontal, with the palm pad supported by the assessor and the curved pad in contact with the patient
Position of Examiner
Standing besides the table, opposite the side being tested, with one hand supporting the DynaMo and the other supporting the patient''s hip of their leg being tested.
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Palm pad and Curved Pad', NULL, NULL, NULL, false, true, 'vald'),
('hip-adduction-supine-elbow-90-degrees', 'Hip adduction', 'Hip', 'Strength', 'Adduction', 'SupineElbow90Degrees', 'Supine - Elbow 90 Degrees', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, true, 'vald'),
('hip-abduction-supine', 'Hip abduction', 'Hip', 'Strength', 'Abduction', 'Supine', 'Supine', 'Bilateral', 'force', 0, false, 'Patient position
Supine on the table with leg being tested in full extension and opposite leg in a hook-lying position.
Contact point
Lateral aspect of the patient''s lower leg, just proximal to the lateral malleolus.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing besides the table, on the same side as the leg being tested with one hand supporting the DynaMo Plus and the other supporting the patient''s leg, just proximal to the hip of their opposite leg.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742500484', 'vald', NULL, false, true, 'vald'),
('hip-abduction-supine-knees-45-degrees', 'Hip abduction', 'Hip', 'Strength', 'Abduction', 'SupineKnees45Degrees', 'Supine - Knees 45 Degrees', 'Bilateral', 'force', 0, false, 'Patient Position
Supine on the table with the leg being tested at 45 degrees of knee flexion in a hook-lying position and the opposite leg fully extended.
Contact Point
Lateral aspect of the patient''s knee.
Device Orientation
Horizontal, with the palm pad supported by the assessor and the curved pad in contact with the patient.
Position of Examiner
Standing adjacent to the bed on the side of the tested leg, supporting the DynaMo.
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Palm pad and Curved Pad', NULL, NULL, NULL, false, true, 'vald'),
('hip-abduction-supine-elbow-90-degrees', 'Hip abduction', 'Hip', 'Strength', 'Abduction', 'SupineElbow90Degrees', 'Supine - Elbow 90 Degrees', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, true, 'vald'),
('hip-abduction-side-lying', 'Hip abduction', 'Hip', 'Strength', 'Abduction', 'SideLying', 'Side Lying', 'Bilateral', 'force', 0, false, 'Patient position
Lying on the side of their leg that is not being assessed, with that leg in 45 degrees hip and knee flexion, and the leg being assessed in full extension.
Contact point
Lateral aspect of lower leg, just proximal to lateral malleolus.
Device orientation
Vertical, the tester end up with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing at the side of the bed, posterior to the patient, with one hand supporting the DynaMo Plus and the other hand supporting the patient''s hip of the leg being tested.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742500375', 'vald', NULL, false, true, 'vald'),
('hip-adduction-abduction-supine', 'Hip adduction / abduction', 'Hip', 'Strength', 'AdductionAbduction', 'Supine', 'Supine', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('hip-adduction-abduction-supine-knees-45-degrees', 'Hip adduction / abduction', 'Hip', 'Strength', 'AdductionAbduction', 'SupineKnees45Degrees', 'Supine - Knees 45 Degrees', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('hip-adduction-abduction-supine-elbow-90-degrees', 'Hip adduction / abduction', 'Hip', 'Strength', 'AdductionAbduction', 'SupineElbow90Degrees', 'Supine - Elbow 90 Degrees', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('hip-adduction-squeeze-supine', 'Hip adduction squeeze', 'Hip', 'Strength', 'AdductionSqueeze', 'Supine', 'Supine', 'Bilateral', 'force', 0, false, 'Patient Position
Supine with both legs fully extended.
Contact Point
Medial aspect of both lower legs, just proximal to both medial malleoli.
Device Orientation
Horizontal, with the palm pad supported by the assessor and the curved pad in contact with the patient
Position of Examiner
Standing or seated at the foot of the table, to place the DynaMo in position.
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Curved pad and Flat pad', NULL, NULL, NULL, false, true, 'vald'),
('hip-adduction-squeeze-supine-knees-45-degrees', 'Hip adduction squeeze', 'Hip', 'Strength', 'AdductionSqueeze', 'SupineKnees45Degrees', 'Supine - Knees 45 Degrees', 'Bilateral', 'force', 0, false, 'Patient Position
Supine with both legs in a hook-lying position and knees flexed to 45 degrees.
Contact Point
Medial aspect of both knees.
Device Orientation
Horizontal, with the palm pad supported by the assessor and the curved pad in contact with the patient
Position of Examiner
Standing or seated next to table, to place the DynaMo in position.
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Curved pad and Flat pad', NULL, NULL, NULL, false, true, 'vald'),
('hip-adduction-squeeze-supine-elbow-90-degrees', 'Hip adduction squeeze', 'Hip', 'Strength', 'AdductionSqueeze', 'SupineElbow90Degrees', 'Supine - Elbow 90 Degrees', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, true, 'vald'),
('hip-isometric-mid-thigh-pull-isometric-mid-thigh-pull', 'Hip isometric mid-thigh pull', 'Hip', 'Strength', 'IsometricMidThighPull', 'IsometricMidThighPull', 'Isometric Mid-Thigh Pull', 'Bilateral', 'force', 0, false, 'Patient Position
Standing on the isometric base plate with hips and knees bent to 45 degrees.
Contact Point
Gripping the lifting bar
Device Orientation
Vertical, with one end connected to the isometric baseplate and the other attached to the tension strap.
Position of Examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Extend you legs, attempting to pull the bar upwards as hard and as fast as possible
Attachments
Tension Strap', 'https://player.vimeo.com/video/999140126', 'vald', NULL, false, true, 'vald'),
('hip-extension-standing-rom', 'Hip extension ROM', 'Hip', 'RangeofMotion', 'Extension', 'Standing', 'Standing', 'Bilateral', 'rom', 0, false, 'Patient position
Standing with their contralateral hand in contact with a fixed surface, for support, opposite to the side being tested, and the leg being tested bent to 90 degrees knee flexion, standing on their opposite leg.
Contact point
Lateral aspect of the patient''s thigh, just proximal to the knee.
Device orientation
Vertical, consistent with the position of the patient''s leg.
Position of examiner
In position to demonstrate and instruct the movement.
Instruction
Extend your hip as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742501332', 'vald', NULL, false, true, 'vald'),
('hip-extension-side-lying-rom', 'Hip extension ROM', 'Hip', 'RangeofMotion', 'Extension', 'SideLying', 'Side Lying', 'Bilateral', 'rom', 0, false, 'Patient position
Lying on the side of their leg that is not being assessed, with that leg in 45 degrees hip and knee flexion, and the leg being assessed in full extension.
Contact point
Fixated to the lateral aspect of the femur, just proximal to the knee.
Device orientation
Horizontal, consistent with the position of the patient''s leg.
Position of examiner
Standing at the side of the bed, posterior to the patient, supporting the patient''s hip to ensure no movement.
Instruction
Extend your hip as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742501245', 'vald', NULL, false, true, 'vald'),
('hip-extension-prone-rom', 'Hip extension ROM', 'Hip', 'RangeofMotion', 'Extension', 'Prone', 'Prone', 'Bilateral', 'rom', 0, false, 'Patient position
Prone on the table with leg being tested in full extension.
Contact point
Fixated to the lateral aspect of the patient''s thigh, just proximal to the knee.
Device orientation
Horizontal, consistent with the position of the patient''s leg position.
Position of examiner
Standing adjacent to the table on the side of the leg being tested, in a position to instruct and demonstrate the movement.
Instruction
Extend your hip as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742501131', 'vald', NULL, false, true, 'vald'),
('hip-flexion-standing-rom', 'Hip flexion ROM', 'Hip', 'RangeofMotion', 'Flexion', 'Standing', 'Standing', 'Bilateral', 'rom', 0, false, 'Patient position
Standing with their contralateral hand in contact with a fixed surface for support, opposite to the side being tested, and the leg being tested bent to 90 degrees knee flexion, standing on their opposite leg.
Contact point
Lateral aspect of the patient''s thigh, just proximal to the knee.
Device orientation
Vertical, consistent with the position of the patient''s leg.
Position of examiner
In position to demonstrate and instruct the movement.
Instruction
Flex your hip as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742501861', 'vald', NULL, false, true, 'vald'),
('hip-flexion-side-lying-rom', 'Hip flexion ROM', 'Hip', 'RangeofMotion', 'Flexion', 'SideLying', 'Side Lying', 'Bilateral', 'rom', 0, false, 'Patient position
Lying on the side of their leg that is not being assessed, with that leg in 45 degree hip and knee flexion, and the leg being assessed in full extension.
Contact point
Fixated to the lateral aspect of the femur, just proximal to the knee.
Device orientation
Horizontal, consistent with the position of the patient''s leg.
Position of examiner
Standing at the side of the bed, posterior to the patient, supporting the patient''s hip to ensure no movement.
Instruction
Flex your hip as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742501678', 'vald', NULL, false, true, 'vald'),
('hip-flexion-supine-rom', 'Hip flexion ROM', 'Hip', 'RangeofMotion', 'Flexion', 'Supine', 'Supine', 'Bilateral', 'rom', 0, false, 'Patient position
Supine, with the leg being assessed in full extension and the opposite leg in a hook-lying position.
Contact point
Fixated to the lateral aspect of the femur, just proximal to the knee.
Device orientation
Horizontal, consistent with the position of the patient''s leg.
Position of examiner
Standing at the side of the bed, in a position to instruct and demonstrate the movement.
Instruction
Flex your hip as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742501936', 'vald', NULL, false, true, 'vald'),
('hip-flexion-seated-rom', 'Hip flexion ROM', 'Hip', 'RangeofMotion', 'Flexion', 'Seated', 'Seated', 'Bilateral', 'rom', 0, false, 'Patient position
Sitting on a chair, supporting their body with their arms.
Contact point
DynaMo Plus attached at lateral aspect of thigh, just above the knee and supported by the ROM strap.
Device orientation
Vertical, in center of thigh.
Position of examiner
Seated adjacent to the patient, in a position to assess movement quality.
Instruction
Move your knee towards your chest as far as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742501766', 'vald', NULL, false, true, 'vald'),
('hip-flexion-extension-standing-rom', 'Hip flexion / extension ROM', 'Hip', 'RangeofMotion', 'FlexionExtension', 'Standing', 'Standing', 'Bilateral', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('hip-flexion-extension-side-lying-rom', 'Hip flexion / extension ROM', 'Hip', 'RangeofMotion', 'FlexionExtension', 'SideLying', 'Side Lying', 'Bilateral', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('hip-internal-rotation-prone-rom', 'Hip internal rotation ROM', 'Hip', 'RangeofMotion', 'InternalRotation', 'Prone', 'Prone', 'Bilateral', 'rom', 0, false, 'Patient position
Prone on the table with leg being tested in 90 degrees of knee flexion.
Contact point
Fixated to the lateral aspect of the patient''s lower leg.
Device orientation
Vertical, consistent with the position of the patient''s lower leg.
Position of examiner
Seated adjacent to the table on the side of the leg being tested, in a position to instruct and demonstrate the movement.
Instruction
Rotate your hip as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742502012', 'vald', NULL, false, true, 'vald'),
('hip-internal-rotation-supine-rom', 'Hip internal rotation ROM', 'Hip', 'RangeofMotion', 'InternalRotation', 'Supine', 'Supine', 'Bilateral', 'rom', 0, false, 'Patient position
Supine, with the leg being assessed bent to 90 degrees hip and knee flexion and opposite leg in full extension.
Contact point
Fixated to the lateral aspect of the patient''s lower leg.
Device orientation
Horizontal, consistent with the position of the patient''s leg.
Position of examiner
Standing at the side of the bed, in a position to instruct and demonstrate the movement.
Instruction
Rotate your hip as far as you can, keeping the DynaMo Lite as still as possible.', 'https://player.vimeo.com/video/795103178', 'vald', NULL, false, true, 'vald'),
('hip-external-rotation-prone-rom', 'Hip external rotation ROM', 'Hip', 'RangeofMotion', 'ExternalRotation', 'Prone', 'Prone', 'Bilateral', 'rom', 0, false, 'Patient position
Prone on the table with leg being tested in 90 degrees of knee flexion.
Contact point
Fixated to the lateral aspect of the patient''s lower leg.
Device orientation
Vertical, consistent with the position of the patient''s leg.
Position of examiner
Seated adjacent to the table on the side of the leg being tested, in a position to instruct and demonstrate the movement.
Instruction
Rotate your hip as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742501399', 'vald', NULL, false, true, 'vald'),
('hip-external-rotation-supine-rom', 'Hip external rotation ROM', 'Hip', 'RangeofMotion', 'ExternalRotation', 'Supine', 'Supine', 'Bilateral', 'rom', 0, false, 'Patient position
Supine, with the leg being assessed bent to 90 degrees hip and knee flexion and opposite leg in full extension.
Contact point
Fixated to the medial aspect of the lower leg, at the midway point along the shin.
Device orientation
Horizontal, consistent with the position of the patient''s leg.
Position of examiner
Standing at the side of the bed, in a position to instruct and demonstrate the movement.
Instruction
Move your leg toward your body as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742501592', 'vald', NULL, true, true, 'vald'),
('hip-internal-rotation-external-rotation-seated-rom', 'Hip internal rotation / external rotation ROM', 'Hip', 'RangeofMotion', 'InternalRotationExternalRotation', 'Seated', 'Seated', 'Bilateral', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('hip-internal-rotation-external-rotation-prone-rom', 'Hip internal rotation / external rotation ROM', 'Hip', 'RangeofMotion', 'InternalRotationExternalRotation', 'Prone', 'Prone', 'Bilateral', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('hip-internal-rotation-external-rotation-supine-rom', 'Hip internal rotation / external rotation ROM', 'Hip', 'RangeofMotion', 'InternalRotationExternalRotation', 'Supine', 'Supine', 'Bilateral', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('hip-adduction-supine-rom', 'Hip adduction ROM', 'Hip', 'RangeofMotion', 'Adduction', 'Supine', 'Supine', 'Bilateral', 'rom', 0, false, 'Patient position
Supine, with the leg being assessed in full extension and opposite leg bent to 90 degrees hip and knee flexion.
Contact point
Fixated to the medial aspect of the lower leg, at the midway point along the shin.
Device orientation
Horizontal, consistent with the position of the patient''s leg.
Position of examiner
Standing at the side of the bed, supporting the leg that is not being assessed, in a position to instruct and demonstrate the movement.
Instruction
Move your leg toward your body as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742500817', 'vald', NULL, false, true, 'vald'),
('hip-abduction-supine-rom', 'Hip abduction ROM', 'Hip', 'RangeofMotion', 'Abduction', 'Supine', 'Supine', 'Bilateral', 'rom', 0, false, 'Patient position
Supine, with the leg being assessed in full extension and opposite leg in a hook-lying position.
Contact point
Fixated to the lateral aspect of the lower leg, at the midway point along the shin.
Device orientation
Horizontal, consistent with the position of the patient''s leg.
Position of examiner
Standing at the side of the bed, in a position to instruct and demonstrate the movement.
Instruction
Move your leg away from your body as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742500639', 'vald', NULL, true, true, 'vald'),
('hip-abduction-standing-rom', 'Hip abduction ROM', 'Hip', 'RangeofMotion', 'Abduction', 'Standing', 'Standing', 'Bilateral', 'rom', 0, false, 'Patient position
Standing with their contralateral hand in contact with a fixed surface for support, opposite to the side being tested, and the leg being tested in full extension, standing on their opposite leg.
Contact point
Lateral aspect of the patient''s thigh, just proximal to the knee.
Device orientation
Vertical, consistent with the position of the patient''s leg.
Position of examiner
In position to demonstrate and instruct the movement.
Instruction
Move your leg away from your body as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742500435', 'vald', NULL, false, true, 'vald'),
('hip-abduction-side-lying-rom', 'Hip abduction ROM', 'Hip', 'RangeofMotion', 'Abduction', 'SideLying', 'Side Lying', 'Bilateral', 'rom', 0, false, 'Patient position
Lying on the side of their leg that is not being assessed, with that leg in 45 degrees hip and knee flexion, and the leg being assessed in full extension.
Contact point
Fixated to the lateral aspect of the femur, just proximal to the knee.
Device orientation
Horizontal, consistent with the position of the patient''s leg.
Position of examiner
Standing at the side of the bed, posterior to the patient, in a position to instruct and demonstrate the movement.
Instruction
Move your leg away from your body as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742500338', 'vald', NULL, false, true, 'vald'),
('hip-adduction-abduction-supine-rom', 'Hip adduction / abduction ROM', 'Hip', 'RangeofMotion', 'AdductionAbduction', 'Supine', 'Supine', 'Bilateral', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('elbow-flexion-p-90-degree-elbow-flexion-wrist-neutral', 'Elbow flexion', 'Elbow', 'Strength', 'Flexion', 'p90DegreeElbowFlexionWristNeutral', '90 Degree Elbow Flexion - Wrist Neutral', 'Bilateral', 'force', 0, false, 'Patient position
Sitting off the edge of the bed with feet on the floor, their elbow bent to 90 degrees and forearm in a neutral position.
Contact point
Lateral / radial aspect of the distal forearm, just proximal to the wrist.
Device orientation
Vertical, with the tester end up and the palm pad supported and the curved pad in contact with the patient.
Position of examiner
Seated behind the patient, using one hand to support the DynaMo Plus, applying downward pressure, and the other to support the patient''s upper arm.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742499475', 'vald', NULL, true, true, 'vald'),
('elbow-flexion-p-90-degree-elbow-flexion-wrist-supinated', 'Elbow flexion', 'Elbow', 'Strength', 'Flexion', 'p90DegreeElbowFlexionWristSupinated', '90 Degree Elbow Flexion - Wrist Supinated', 'Bilateral', 'force', 0, false, 'Patient position
Sitting off the edge of the bed with feet on the floor, their elbow bent to 90 degrees and forearm supinated.
Contact point
Anterior aspect of the distal forearm, just proximal to the wrist.
Device orientation
Vertical, with the tester end up and the palm pad supported and the curved pad in contact with the patient.
Position of examiner
Seated beside the patient, using one hand to support the DynaMo Plus, applying downward pressure, and the other to support the patient''s upper arm.
Instruction
Push against the pad as hard as you ca. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742499657', 'vald', NULL, false, true, 'vald'),
('elbow-flexion-p-90-degree-elbow-flexion-wrist-pronated', 'Elbow flexion', 'Elbow', 'Strength', 'Flexion', 'p90DegreeElbowFlexionWristPronated', '90 Degree Elbow Flexion - Wrist Pronated', 'Bilateral', 'force', 0, false, 'Patient position
Sitting off the edge of the bed with feet on the floor, their elbow bent to 90 degrees and forearm pronated.
Contact point
Posterior aspect of the distal forearm, just proximal to the wrist.
Device orientation
Vertical, with the tester end up and the palm pad supported and the curved pad in contact with the patient.
Position of examiner
Seated beside the patient, using one hand to support the DynaMo Plus, applying downward pressure, and the other to support the patient''s upper arm.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742499568', 'vald', NULL, false, true, 'vald'),
('elbow-flexion-p-90-degree-elbow-flexion-90-abduction-wrist-neutral', 'Elbow flexion', 'Elbow', 'Strength', 'Flexion', 'p90DegreeElbowFlexion90AbductionWristNeutral', '90 Degree Elbow Flexion, 90 Abduction - Wrist Neutral', 'Bilateral', 'force', 0, false, 'Patient Position
Seated on the edge of the bed with feet on the floor, their elbow bent to 90 degrees and forearm in a neutral position.
Contact Point
Lateral/radial aspect of the distal forearm, just proximal to the wrist.
Device Orientation
Vertical, with the palm pad supported by the practitioner and the curved pad in contact with the patient
Position of Examiner
Seated beside the patient, using one hand to support the DynaMo, applying downward pressure, and the other to support the patient''s upper arm
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Palm pad and Curved Pad', NULL, NULL, NULL, false, true, 'vald'),
('elbow-flexion-p-90-degree-elbow-flexion-90-abduction-wrist-supinated', 'Elbow flexion', 'Elbow', 'Strength', 'Flexion', 'p90DegreeElbowFlexion90AbductionWristSupinated', '90 Degree Elbow Flexion, 90 Abduction - Wrist Supinated', 'Bilateral', 'force', 0, false, 'Patient Position
Seated on the edge of the bed with feet on the floor, their elbow bent to 90 degrees and forearm supinated.
Contact Point
Anterior aspect of the distal forearm, just proximal to the wrist.
Device Orientation
Vertical, with the palm pad supported by the practitioner and the curved pad in contact with the patient
Position of Examiner
Seated beside the patient, using one hand to support the DynaMo, applying downward pressure, and the other to support the patient''s upper arm
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Palm pad and Curved Pad', NULL, NULL, NULL, false, true, 'vald'),
('elbow-flexion-p-90-degree-elbow-flexion-90-abduction-wrist-pronated', 'Elbow flexion', 'Elbow', 'Strength', 'Flexion', 'p90DegreeElbowFlexion90AbductionWristPronated', '90 Degree Elbow Flexion, 90 Abduction - Wrist Pronated', 'Bilateral', 'force', 0, false, 'Patient Position
Seated on the edge of the bed with feet on the floor, their elbow bent to 90 degrees and forearm pronated.
Contact Point
Posterior aspect of the distal forearm, just proximal to the wrist.
Device Orientation
Vertical, with the palm pad supported by the practitioner and the curved pad in contact with the patient
Position of Examiner
Seated beside the patient, using one hand to support the DynaMo, applying downward pressure, and the other to support the patient''s upper arm
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Palm pad and Curved Pad', NULL, NULL, NULL, false, true, 'vald'),
('elbow-extension-p-90-degrees-elbow-flexion', 'Elbow extension', 'Elbow', 'Strength', 'Extension', 'p90DegreesElbowFlexion', '90 Degrees Elbow Flexion', 'Bilateral', 'force', 0, false, 'Patient position
Sitting upright, feet on the ground, with their arm being tested at their side, elbow flexed to 90 degrees and forearm in a neutral position, with their back to a fixed surface.
Contact point
Medial aspect of the forearm, just proximal to the wrist.
Device orientation
Horizontal, with the curved pad in contact with the patient and the flat pad in contact with a fixed surface.
Position of examiner
Standing next to the patient in a position to place the DynaMo Plus, instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Flat pad, curved pad.', 'https://player.vimeo.com/video/744399307', 'vald', NULL, false, true, 'vald'),
('elbow-flexion-extension-p-90-degrees-elbow-flexion', 'Elbow flexion / extension', 'Elbow', 'Strength', 'FlexionExtension', 'p90DegreesElbowFlexion', '90 Degrees Elbow Flexion', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('elbow-flexion-seated-rom', 'Elbow flexion ROM', 'Elbow', 'RangeofMotion', 'Flexion', 'Seated', 'Seated', 'Bilateral', 'rom', 0, false, 'Patient position
Seated at the edge of the bed so that their arm being assessed remains at their side with their elbow extended and forearm supinated.
Contact point
Fixed superior to the wrist.
Device orientation
Horizontal, consistent with the position of the patient''s hand.
Position of examiner
Seated adjacent to or in front of the patient, in a position to instruct and demonstrate the movement.
Instruction
Move your hand towards your shoulder as far as you can, keeping the DynaMo Lite as still as possible.', 'https://player.vimeo.com/video/795104488', 'vald', NULL, true, true, 'vald'),
('elbow-flexion-supine-rom', 'Elbow flexion ROM', 'Elbow', 'RangeofMotion', 'Flexion', 'Supine', 'Supine', 'Bilateral', 'rom', 0, false, 'Patient position
Supine, with the arm fully extended at the patient''s side, with their forearm supinated.
Contact point
Held in patient''s hand.
Device orientation
Horizontal, consistent with the position of the patient''s arm.
Position of examiner
Seated at the side of the bed, in a position to instruct and demonstrate the movement.
Instruction
Move your hand toward your shoulder as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
No attachments.', 'https://player.vimeo.com/video/744400244', 'vald', NULL, false, true, 'vald'),
('elbow-extension-seated-rom', 'Elbow extension ROM', 'Elbow', 'RangeofMotion', 'Extension', 'Seated', 'Seated', 'Bilateral', 'rom', -90, false, 'Patient position
Seated at the edge of the bed with their arm being assessed at their side, elbow flexed to 90 degrees and forearm in neutral.
Contact point
Fixed superior to the wrist.
Device orientation
Horizontal, consistent with the position of the patient''s forearm.
Position of examiner
Seated adjacent to or in front of the patient, in a position to instruct and demonstrate the movement.
Instruction
Move your hand away from your body as far as you can, keeping the DynaMo Lite as still as possible.', 'https://player.vimeo.com/video/795104436', 'vald', NULL, true, true, 'vald'),
('elbow-extension-supine-rom', 'Elbow extension ROM', 'Elbow', 'RangeofMotion', 'Extension', 'Supine', 'Supine', 'Bilateral', 'rom', -90, false, 'Patient position
Supine, with the arm at the patient''s side, their elbow bent to 90 degrees and their forearm supinated.
Contact point
Midway along the lateral aspect of the forearm.
Device orientation
Horizontal, consistent with the position of the patient''s arm.
Position of examiner
Seated at the side of the bed, in a position to instruct and demonstrate the movement.
Instruction
Move your hand away from your body as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
No attachments.', 'https://player.vimeo.com/video/744399971', 'vald', NULL, false, true, 'vald'),
('elbow-flexion-extension-seated-rom', 'Elbow flexion / extension ROM', 'Elbow', 'RangeofMotion', 'FlexionExtension', 'Seated', 'Seated', 'Bilateral', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('elbow-flexion-extension-supine-rom', 'Elbow flexion / extension ROM', 'Elbow', 'RangeofMotion', 'FlexionExtension', 'Supine', 'Supine', 'Bilateral', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('wrist-supination-p-90-degrees-elbow-flexion-wrist-neutral', 'Wrist supination', 'Wrist', 'Strength', 'Supination', 'p90DegreesElbowFlexionWristNeutral', '90 Degrees Elbow Flexion - Wrist Neutral', 'Bilateral', 'force', 0, false, 'Patient position
Seated adjacent to the table with their arm being tested resting on the table and forearm in a neutral position, and hand extending far enough so that the wrist is not supported by the table.
Contact point
Gripping dowel.
Device orientation
Vertical, consistent with the position of the patient''s hand.
Position of examiner
Seated adjacent to the patient in a position to instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742537244', 'vald', NULL, false, true, 'vald'),
('wrist-pronation-p-90-degree-elbow-flexion-wrist-neutral', 'Wrist pronation', 'Wrist', 'Strength', 'Pronation', 'p90DegreeElbowFlexionWristNeutral', '90 Degree Elbow Flexion - Wrist Neutral', 'Bilateral', 'force', 0, false, 'Patient position
Seated adjacent to the table with their arm being tested resting on the table and forearm in a neutral position, and hand extending far enough so that the wrist is not supported by the table.
Contact point
Gripping dowel.
Device orientation
Vertical, consistent with the position of the patient''s hand.
Position of examiner
Seated adjacent to the patient in a position to instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742536817', 'vald', NULL, false, true, 'vald'),
('wrist-supination-pronation-p-90-degree-elbow-flexion-wrist-neutral', 'Wrist supination / pronation', 'Wrist', 'Strength', 'SupinationPronation', 'p90DegreeElbowFlexionWristNeutral', '90 Degree Elbow Flexion - Wrist Neutral', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('wrist-flexion-p-90-degree-elbow-flexion-wrist-neutral', 'Wrist flexion', 'Wrist', 'Strength', 'Flexion', 'p90DegreeElbowFlexionWristNeutral', '90 Degree Elbow Flexion - Wrist Neutral', 'Bilateral', 'force', 0, false, 'Patient position
Seated adjacent to the table with their arm being tested resting on the table and forearm in a neutral position, hand in a clenched fist extending far enough so that the wrist is not supported by the table.
Contact point
Palmar side of clenched fist, along dorsal surface of the middle phalanx.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Seated adjacent to, and slightly in front of the patient, holding the DynaMo Plus with one hand and supporting the patient''s forearm with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742536541', 'vald', NULL, true, true, 'vald'),
('wrist-extension-p-90-degree-elbow-flexion-wrist-neutral', 'Wrist extension', 'Wrist', 'Strength', 'Extension', 'p90DegreeElbowFlexionWristNeutral', '90 Degree Elbow Flexion - Wrist Neutral', 'Bilateral', 'force', 0, false, 'Patient position
Seated adjacent to the table with their arm being tested resting on the table and forearm in a neutral position, hand in a clenched fist extending far enough so that the wrist is not supported by the table.
Contact point
Dorsal surface of hand.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Seated adjacent to, and slightly in front of the patient, holding the DynaMo Plus with one hand and supporting the patient''s forearm with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742536379', 'vald', NULL, false, true, 'vald'),
('wrist-flexion-extension-p-90-degree-elbow-flexion-wrist-neutral', 'Wrist flexion / extension', 'Wrist', 'Strength', 'FlexionExtension', 'p90DegreeElbowFlexionWristNeutral', '90 Degree Elbow Flexion - Wrist Neutral', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('wrist-ulna-deviation-p-90-degree-elbow-flexion-wrist-neutral', 'Wrist ulna deviation', 'Wrist', 'Strength', 'UlnaDeviation', 'p90DegreeElbowFlexionWristNeutral', '90 Degree Elbow Flexion - Wrist Neutral', 'Bilateral', 'force', 0, false, 'Patient position
Seated adjacent to the table with their arm being tested resting on the table and forearm in a neutral position, and hand extending far enough so that the wrist is not supported by the table.
Contact point
Ulnar aspect of the fist, in contact with the lateral aspect of the 5th digit and hypothenar eminence.
Device orientation
Vertical, tester end down with the palm pad supported by the practitioner and the flat pad in contact with the patient.
Position of examiner
Seated adjacent to the patient, with one hand supporting the DynaMo Plus and the other supporting the patient''s forearm, just proximal to their wrist.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Flat pad and palm pad.', 'https://player.vimeo.com/video/742537584', 'vald', NULL, false, true, 'vald'),
('wrist-ulna-deviation-p-90-degree-elbow-flexion-wrist-supinated', 'Wrist ulna deviation', 'Wrist', 'Strength', 'UlnaDeviation', 'p90DegreeElbowFlexionWristSupinated', '90 Degree Elbow Flexion - Wrist Supinated', 'Bilateral', 'force', 0, false, 'Patient position
Seated adjacent to the table with their arm being tested resting on the table and forearm in a supinated position, hand in a clenched fist extending far enough so that the wrist is not supported by the table.
Contact point
Ulnar aspect of the fist, in contact with the lateral aspect of the 5th digit and hypothenar eminence.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Seated adjacent to, and slightly in front of the patient, holding the DynaMo Plus with one hand and supporting the patient''s forearm with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742537407', 'vald', NULL, false, true, 'vald'),
('wrist-ulna-deviation-p-90-degree-elbow-flexion-wrist-pronated', 'Wrist ulna deviation', 'Wrist', 'Strength', 'UlnaDeviation', 'p90DegreeElbowFlexionWristPronated', '90 Degree Elbow Flexion - Wrist Pronated', 'Bilateral', 'force', 0, false, 'Patient position
Seated adjacent to the table with their arm being tested resting on the table and forearm in a pronated position, hand in a clenched fist extending far enough so that the wrist is not supported by the table.
Contact point
Ulnar aspect of the fist, in contact with the lateral aspect of the 5th digit and hypothenar eminence.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Seated adjacent to, and slightly in front of the patient, holding the DynaMo Plus with one hand and supporting the patient''s forearm with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742537355', 'vald', NULL, false, true, 'vald'),
('wrist-radial-deviation-p-90-degree-elbow-flexion-wrist-neutral', 'Wrist radial deviation', 'Wrist', 'Strength', 'RadialDeviation', 'p90DegreeElbowFlexionWristNeutral', '90 Degree Elbow Flexion - Wrist Neutral', 'Bilateral', 'force', 0, false, 'Patient position
Seated adjacent to the table with their arm being tested resting on the table and forearm in a neutral position, and hand extending far enough so that the wrist is not supported by the table.
Contact point
Radial aspect of the fist, in contact with the lateral aspect of the index finger and thumb.
Device orientation
Vertical, tester end up with the palm pad supported by the practitioner and the flat pad in contact with the patient.
Position of examiner
Seated adjacent to the patient, with one hand supporting the DynaMo Plus and the other supporting the patient''s forearm, just proximal to their wrist.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Flat pad and palm pad.', 'https://player.vimeo.com/video/742536977', 'vald', NULL, false, true, 'vald'),
('wrist-radial-deviation-p-90-degree-elbow-flexion-wrist-supinated', 'Wrist radial deviation', 'Wrist', 'Strength', 'RadialDeviation', 'p90DegreeElbowFlexionWristSupinated', '90 Degree Elbow Flexion - Wrist Supinated', 'Bilateral', 'force', 0, false, 'Patient position
Seated adjacent to the table with their arm being tested resting on the table and forearm in a supinated position, hand in a clenched fist extending far enough so that the wrist is not supported by the table.
Contact point
Radial aspect of the fist, in contact with the lateral aspect of the 1st digit and thumb.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Seated adjacent to, and slightly in front of the patient, holding the DynaMo Plus with one hand and supporting the patient''s forearm with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742536921', 'vald', NULL, false, true, 'vald'),
('wrist-radial-deviation-p-90-degree-elbow-flexion-wrist-pronated', 'Wrist radial deviation', 'Wrist', 'Strength', 'RadialDeviation', 'p90DegreeElbowFlexionWristPronated', '90 Degree Elbow Flexion - Wrist Pronated', 'Bilateral', 'force', 0, false, 'Patient position
Seated adjacent to the table with their arm being tested resting on the table and forearm in a pronated position, hand in a clenched fist extending far enough so that the wrist is not supported by the table.
Contact point
Radial aspect of the fist, in contact with the lateral aspect of the 1st digit and thumb.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Seated adjacent to, and slightly in front of the patient, holding the DynaMo Plus with one hand and supporting the patient''s forearm with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742537112', 'vald', NULL, false, true, 'vald'),
('wrist-supination-p-90-degree-elbow-flexion-wrist-neutral-rom', 'Wrist supination ROM', 'Wrist', 'RangeofMotion', 'Supination', 'p90DegreeElbowFlexionWristNeutral', '90 Degree Elbow Flexion - Wrist Neutral', 'Bilateral', 'rom', 0, false, 'Patient Position
Seated adjacent to the table with their arm being tested resting on the table and forearm in a neutral position, and hand extending far enough so that the wrist is not supported by the table.
Contact Point
Held in patient''s hand.
Device Orientation
Vertical, consistent with the position of the patient''s hand.
Position of Examiner
Seated adjacent to the patient in a position to instruct and demonstrate the movement.
Instruction
Rotate your wrist away from your body as far as you can, keeping the DynaMo as still as possible.
Attachments
No attachments.', NULL, NULL, NULL, false, true, 'vald'),
('wrist-pronation-p-90-degree-elbow-flexion-wrist-neutral-rom', 'Wrist pronation ROM', 'Wrist', 'RangeofMotion', 'Pronation', 'p90DegreeElbowFlexionWristNeutral', '90 Degree Elbow Flexion - Wrist Neutral', 'Bilateral', 'rom', 0, false, 'Patient Position
Seated adjacent to the table with their arm being tested resting on the table and forearm in a neutral position, and hand extending far enough so that the wrist is not supported by the table.
Contact Point
Held in patient''s hand.
Device Orientation
Vertical, consistent with the position of the patient''s hand.
Position of Examiner
Seated adjacent to the patient in a position to instruct and demonstrate the movement.
Instruction
Rotate your wrist toward your body as far as you can, keeping the DynaMo as still as possible.
Attachments
No attachments.', NULL, NULL, NULL, false, true, 'vald'),
('wrist-supination-pronation-p-90-degree-elbow-flexion-wrist-neutral-rom', 'Wrist supination / pronation ROM', 'Wrist', 'RangeofMotion', 'SupinationPronation', 'p90DegreeElbowFlexionWristNeutral', '90 Degree Elbow Flexion - Wrist Neutral', 'Bilateral', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('wrist-flexion-p-90-degrees-elbow-flexion-rom', 'Wrist flexion ROM', 'Wrist', 'RangeofMotion', 'Flexion', 'p90DegreesElbowFlexion', '90 Degrees Elbow Flexion', 'Bilateral', 'rom', 0, false, 'Patient position
Seated adjacent to the table with their arm being tested resting on the table and forearm in a neutral position, and hand extending far enough so that the wrist is not supported by the table.
Contact point
Held in patient''s hand.
Device orientation
Vertical, consistent with the position of the patient''s hand.
Position of examiner
Seated adjacent to the patient in a position to instruct and demonstrate the movement.
Instruction
Flex your wrist as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
No attachment.', 'https://player.vimeo.com/video/742536625', 'vald', NULL, false, true, 'vald'),
('wrist-extension-p-90-degrees-elbow-flexion-rom', 'Wrist extension ROM', 'Wrist', 'RangeofMotion', 'Extension', 'p90DegreesElbowFlexion', '90 Degrees Elbow Flexion', 'Bilateral', 'rom', 0, false, 'Patient position
Seated adjacent to the table with their arm being tested resting on the table and forearm in a neutral position, and hand extending far enough so that the wrist is not supported by the table.
Contact point
Held in patient''s hand.
Device orientation
Vertical, consistent with the position of the patient''s hand.
Position of examiner
Seated adjacent to the patient in a position to instruct and demonstrate the movement.
Instruction
Extend your wrist as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
No attachment.', 'https://player.vimeo.com/video/742536478', 'vald', NULL, false, true, 'vald'),
('wrist-ulna-deviation-p-90-degrees-elbow-flexion-rom', 'Wrist ulna deviation ROM', 'Wrist', 'RangeofMotion', 'UlnaDeviation', 'p90DegreesElbowFlexion', '90 Degrees Elbow Flexion', 'Bilateral', 'rom', 0, false, 'Patient position
Seated adjacent to the table with their arm being tested resting on the table and forearm in a pronated position, and hand extending far enough so that the wrist is not supported by the table.
Contact point
Held in patient''s hand.
Device orientation
Horizontal, consistent with the position of the patient''s hand.
Position of examiner
Seated adjacent to the patient in a position to instruct and demonstrate the movement.
Instruction
Deviate your wrist away from your body as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
No attachment.', 'https://player.vimeo.com/video/742536667', 'vald', NULL, false, true, 'vald'),
('wrist-radial-deviation-p-90-degrees-elbow-flexion-rom', 'Wrist radial deviation ROM', 'Wrist', 'RangeofMotion', 'RadialDeviation', 'p90DegreesElbowFlexion', '90 Degrees Elbow Flexion', 'Bilateral', 'rom', 0, false, 'Patient position
Seated adjacent to the table with their arm being tested resting on the table and forearm in a pronated position, and hand extending far enough so that the wrist is not supported by the table.
Contact point
Held in patient''s hand.
Device orientation
Horizontal, consistent with the position of the patient''s hand.
Position of examiner
Seated adjacent to the patient in a position to instruct and demonstrate the movement.
Instruction
Deviate your wrist toward your body as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
No attachment.', 'https://player.vimeo.com/video/742537155', 'vald', NULL, false, true, 'vald'),
('hand-grip-squeeze-p-90-degrees-elbow-flexion', 'Hand grip squeeze', 'Hand', 'Strength', 'GripSqueeze', 'p90DegreesElbowFlexion', '90 Degrees Elbow Flexion', 'Bilateral', 'force', 0, true, 'Patient position
Sitting off the edge of the bed with feet not touching the floor, their arm being tested at their side in 90 degrees of elbow flexion and their forearm in a neutral position, their other arm relaxed at their side.
Contact point
Held in patient''s hand.
Device orientation
Horizontal, in the grip strength assessment configuration.
Position of examiner
Seated in front of the patient, supporting the DynaMo Plus as the patient assumes the testing position.
Instruction
Squeeze against the attachment as hard as you can. 3, 2, 1 - squeeze, squeeze, squeeze and relax.
Attachments
Grip strength attachment.', 'https://player.vimeo.com/video/742500134', 'vald', NULL, false, true, 'vald'),
('grip-squeeze', 'Hand grip squeeze', 'Hand', 'Strength', 'GripSqueeze', 'Neutral', 'Neutral', 'Bilateral', 'force', 0, true, 'Patient position
Sitting off the edge of the bed with feet not touching the floor, their arm being tested at their side and their elbow extended and their forearm in a neutral position, their other arm relaxed at their side.
Contact point
Held in patient''s hand.
Device orientation
Vertical, in the grip strength assessment configuration.
Position of examiner
Seated in front of the patient.
Instruction
Squeeze against the attachment as hard as you can. 3, 2, 1 - squeeze, squeeze, squeeze and relax.
Attachments
Grip strength attachment.', 'https://player.vimeo.com/video/742500289', 'vald', NULL, true, true, 'vald'),
('hand-grip-squeeze-p-90-degrees-shoulder-flexion', 'Hand grip squeeze', 'Hand', 'Strength', 'GripSqueeze', 'p90DegreesShoulderFlexion', '90 Degrees Shoulder Flexion', 'Bilateral', 'force', 0, true, 'Patient position
Sitting off the edge of the bed with feet not touching the floor, their arm straight, shoulder flexed to 90 degrees and their forearm in a neutral position, and their other arm relaxed at their side.
Contact point
Held in patient''s hand.
Device orientation
Horizontal, in the grip strength assessment configuration.
Position of examiner
Seated in front of the patient, supporting the DynaMo Plus until the patient applies force.
Instruction
Squeeze against the attachment as hard as you can. 3, 2, 1 - squeeze, squeeze, squeeze and relax.
Attachments
Grip strength attachment.', 'https://player.vimeo.com/video/742500230', 'vald', NULL, false, true, 'vald'),
('knee-flexion-seated', 'Knee flexion', 'Knee', 'Strength', 'Flexion', 'Seated', 'Seated', 'Bilateral', 'force', 0, false, 'Patient position
Sitting off the edge of the bed with feet not touching the floor, their arms crossed and hands placed on the opposite shoulder, with hips and knees each at 90 degrees flexion.
Contact point
At the location of the achilles tendon.
Device orientation
Horizontal, with the device and palm pad supported by the practitioner and the curved end in contact with the patient.
Position of examiner
Kneeling in front of the patient, supporting the DynaMo Plus with both hands, behind the patient''s shin, resisting posterior force.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742518770', 'vald', NULL, true, true, 'vald'),
('knee-flexion-supine', 'Knee flexion', 'Knee', 'Strength', 'Flexion', 'Supine', 'Supine', 'Bilateral', 'force', 0, false, 'Patient position
Supine, with the leg being assessed bent to 90 degrees hip and knee flexion and opposite leg in full extension.
Contact point
Distal aspect of the posterior lower leg, just proximal to the ankle.
Device orientation
Vertical, with the tester end up and palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing at the side of the bed, holding the DynaMo Plus with one hand and supporting tested leg just proximal to the knee with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', 'https://player.vimeo.com/video/742518937', 'vald', NULL, false, true, 'vald'),
('knee-flexion-prone', 'Knee flexion', 'Knee', 'Strength', 'Flexion', 'Prone', 'Prone', 'Bilateral', 'force', 0, false, 'Patient position
Prone on the table with leg being tested in 90 degrees of knee flexion.
Contact point
Posterior aspect of the patient''s lower leg, just proximal to the ankle.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Standing adjacent to the table on the side of the tested leg, with one supporting the DynaMo Plus, the other hand supporting the patient''s upper leg, just proximal to the knee, to ensure minimal movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742518621', 'vald', NULL, true, true, 'vald'),
('knee-extension-seated', 'Knee extension', 'Knee', 'Strength', 'Extension', 'Seated', 'Seated', 'Bilateral', 'force', 0, false, 'Patient position
Seated at the edge of the table, with both arms relaxed on their legs or crossed.
Contact point
Anterior lower leg, just proximal to the ankle.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Kneeling between the patient and a wall or fixed surface, holding the DynaMo Plus with both hands and using the elbow of their outside arm to block using the fixed surface.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/744408796', 'vald', NULL, true, true, 'vald'),
('knee-extension-supine', 'Knee extension', 'Knee', 'Strength', 'Extension', 'Supine', 'Supine', 'Bilateral', 'force', 0, false, 'Patient position
Supine with knees bent to 90 degrees and lower legs hanging just off the edge of the table, with both arms relaxed or crossed.
Contact point
Anterior lower leg, just proximal to the ankle.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Kneeling between the patient and a wall or fixed surface, holding the DynaMo Plus with both hands and using the elbow of their outside arm to block using the fixed surface.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742521849', 'vald', NULL, true, true, 'vald'),
('knee-extension-prone', 'Knee extension', 'Knee', 'Strength', 'Extension', 'Prone', 'Prone', 'Bilateral', 'force', 0, false, 'Patient position
Prone on the table with leg being tested in 45 degrees of knee flexion.
Contact point
Anterior aspect of the patient''s lower leg, just proximal to the ankle.
Device orientation
Diagonal, with the tester end down, palm pad supported by the practitioner, and the curved pad in contact with the patient.
Position of examiner
Seated adjacent to the table on the side of the tested leg, with one hand blocked by the table and supporting the DynaMo Plus, with the other hand applying downward pressure the patient''s upper leg, just proximal to the knee, to ensure minmal movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742502860', 'vald', NULL, false, true, 'vald'),
('knee-flexion-extension-seated', 'Knee flexion / extension', 'Knee', 'Strength', 'FlexionExtension', 'Seated', 'Seated', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('knee-flexion-extension-supine', 'Knee flexion / extension', 'Knee', 'Strength', 'FlexionExtension', 'Supine', 'Supine', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('knee-flexion-extension-prone', 'Knee flexion / extension', 'Knee', 'Strength', 'FlexionExtension', 'Prone', 'Prone', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('knee-flexion-seated-rom', 'Knee flexion ROM', 'Knee', 'RangeofMotion', 'Flexion', 'Seated', 'Seated', 'Bilateral', 'rom', 0, false, 'Patient position
Sitting off the end of the table with their hips and knees both at 90 degrees flexion, allowing ample space below where the patient is seated in order for the lower leg to move posteriorly uninterrupted.
Contact point
Fixated along the lateral aspect of the patient''s lower leg.
Device orientation
Vertical, consistent with the position of the patient''s leg.
Position of examiner
Seated or kneeling in front of the patient, in a position to instruct and demonstrate the movement.
Instruction
Flex your knee as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742518839', 'vald', NULL, true, true, 'vald'),
('knee-flexion-rom', 'Knee flexion ROM', 'Knee', 'RangeofMotion', 'Flexion', 'Prone', 'Prone', 'Bilateral', 'rom', 0, false, 'Patient position
Prone on the table with leg being tested in full extension.
Contact point
Fixated to the lateral aspect of the lower leg.
Device orientation
Horizontal, consistent with the position of the patient''s leg.
Position of examiner
Sitting adjacent to the table on the side of the tested leg, in a position to instruct and demonstrate the movement.
Instruction
Flex your knee as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742518674', 'vald', NULL, true, true, 'vald'),
('knee-extension-rom', 'Knee extension ROM', 'Knee', 'RangeofMotion', 'Extension', 'Seated', 'Seated', 'Bilateral', 'rom', -90, false, 'Patient position
Siting off the end of the table with their hips and knees both at 90 degrees flexion.
Contact point
Fixated along the lateral aspect of the patient''s lower leg.
Device orientation
Vertical, consistent with the position of the patient''s leg.
Position of examiner
Seated or kneeling in front of the patient, in a position to instruct and demonstrate the movement.
Instruction
Extend and straighten your knee as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742503424', 'vald', NULL, true, true, 'vald'),
('knee-extension-supine-rom', 'Knee extension ROM', 'Knee', 'RangeofMotion', 'Extension', 'Supine', 'Supine', 'Bilateral', 'rom', -90, false, 'Patient position
Supine, with knees flexed to 90 degrees and both hanging over the edge of the table.
Contact point
Fixed to the lateral aspect of the lower leg.
Device orientation
Vertical, consistent with the position of the patient''s leg.
Position of examiner
Seated next to the patient in a position to demonstrate and instruct the movement.
Instruction
Extend and straighten your knee as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742521935', 'vald', NULL, true, true, 'vald'),
('knee-extension-prone-rom', 'Knee extension ROM', 'Knee', 'RangeofMotion', 'Extension', 'Prone', 'Prone', 'Bilateral', 'rom', -90, false, 'Patient position
Prone on the table with leg being tested in 90 degrees of knee flexion.
Contact point
Fixated to the lateral aspect of the patient''s lower leg.
Device orientation
Vertical, consistent with the position of the patient''s leg.
Position of examiner
Standing adjacent to the table on the side of the leg being tested, in a position to instruct and demonstrate the movement.
Instruction
Extend your knee as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/744402700', 'vald', NULL, false, true, 'vald'),
('knee-flexion-extension-seated-rom', 'Knee flexion / extension ROM', 'Knee', 'RangeofMotion', 'FlexionExtension', 'Seated', 'Seated', 'Bilateral', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('knee-flexion-extension-prone-rom', 'Knee flexion / extension ROM', 'Knee', 'RangeofMotion', 'FlexionExtension', 'Prone', 'Prone', 'Bilateral', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('ankle-inversion-long-sitting-plantigrade', 'Ankle inversion', 'Ankle', 'Strength', 'Inversion', 'LongSittingPlantigrade', 'Long Sitting - Plantigrade', 'Bilateral', 'force', 0, false, 'Patient position
Long sitting with the leg not being tested in a hook-lying position and the leg being tested in full extension. The ankle in neutral and foot extended past the edge of the bed so that it is not supported.
Contact point
Medial aspect of the foot.
Device orientation
Vertical, with the curved surface in contact with the medial aspect of the patient''s forefoot and the flat surface being supported by the examiner.
Position of examiner
Seated at the foot of the bed, distal to the patient in a position to support the DynaMo Lite in one hand, applying lateral force to the foot, and supporting the patient with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 – push, push, push and relax.', 'https://player.vimeo.com/video/795101505', 'vald', NULL, false, true, 'vald'),
('ankle-eversion-long-sitting-plantigrade', 'Ankle eversion', 'Ankle', 'Strength', 'Eversion', 'LongSittingPlantigrade', 'Long Sitting - Plantigrade', 'Bilateral', 'force', 0, false, 'Patient position
Long sitting with the leg not being tested in a hook-lying position and the leg being tested in full extension. The ankle in neutral and foot extended past the edge of the bed so that it is not supported.
Contact point
Lateral aspect of the foot.
Device orientation
Vertical, with the curved surface in contact with the lateral aspect of the patient''s forefoot and the flat surface being supported by the examiner.
Position of examiner
Seated at the foot of the bed, distal to the patient in a position to support the DynaMo Lite in one hand, applying medial force to the foot, and supporting the patient with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 – push, push, push and relax.', 'https://player.vimeo.com/video/795101474', 'vald', NULL, false, true, 'vald'),
('ankle-inversion-eversion-long-sitting-plantigrade', 'Ankle inversion / eversion', 'Ankle', 'Strength', 'InversionEversion', 'LongSittingPlantigrade', 'Long Sitting - Plantigrade', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('ankle-dorsiflexion-long-sitting-plantigrade', 'Ankle dorsiflexion', 'Ankle', 'Strength', 'Dorsiflexion', 'LongSittingPlantigrade', 'Long Sitting - Plantigrade', 'Bilateral', 'force', 0, false, 'Patient position
Long sitting with the leg not being tested in a hook-lying position and the leg being tested in full extension. The ankle in neutral and foot extended past the edge of the bed so that it is not supported.
Contact point
Anterior aspect of the foot.
Device orientation
Vertical, with the curved surface in contact with the dorsum of the patient''s foot and the flat surface being supported by the examiner.
Position of examiner
Seated next to the patient in a position to support the DynaMo Lite in one hand, applying inferior force to the foot, and supporting the patient with the other.
Instruction
Push against the pad as hard as you can. 3, 2, 1 – push, push, push and relax.', 'https://player.vimeo.com/video/795101448', 'vald', NULL, false, true, 'vald'),
('ankle-plantar-flexion-long-sitting', 'Ankle plantar flexion', 'Ankle', 'Strength', 'PlantarFlexion', 'LongSitting', 'Long Sitting', 'Bilateral', 'force', 0, false, 'Patient position
Long sitting or supine, with the leg being tested fully extended and opposite in a hook-lying position, with the ankle in a neutral position and situated just proximal to a fixed surface.
Contact point
Distal aspect of the plantar surface of the foot.
Device orientation
Horizontal, with the curved pad in contact with the patient and the flat pad in contact with a fixed surface.
Position of examiner
Seated or kneeling next to the patient in position to place the DynaMo Plus, instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Flat pad, curved pad.', 'https://player.vimeo.com/video/744398633', 'vald', NULL, false, true, 'vald'),
('ankle-dorsiflexion-plantar-flexion-long-sitting', 'Ankle dorsiflexion / plantar flexion', 'Ankle', 'Strength', 'DorsiflexionPlantarFlexion', 'LongSitting', 'Long Sitting', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('ankle-inversion-seated-rom', 'Ankle inversion ROM', 'Ankle', 'RangeofMotion', 'Inversion', 'Seated', 'Seated', 'Bilateral', 'rom', 0, false, 'Patient position
Sitting off the end of the table with their hips and knees both at 90 degrees flexion.
Contact point
Fixated along the lateral aspect of the patient''s foot.
Device orientation
Horizontal, consistent with the position of the patient''s foot.
Position of examiner
Seated or kneeling in front of the patient, in a position to instruct and demonstrate the movement.
Instruction
Rotate your ankle as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742499237', 'vald', NULL, false, true, 'vald'),
('ankle-inversion-long-sitting-plantar-flexed-rom', 'Ankle inversion ROM', 'Ankle', 'RangeofMotion', 'Inversion', 'LongSittingPlantarFlexed', 'Long Sitting - Plantar Flexed', 'Bilateral', 'rom', 0, false, 'Patient position
Long sitting with their lower leg extending past the table, allowing the ankle to be unsupported, in a plantarflexed position.
Contact point
Fixated along the lateral aspect of the patient''s foot.
Device orientation
Horizontal, consistent with the plantarflexed position maintained by the patient.
Position of examiner
Seated at the foot of the bed, medial to the leg being tested, in a position to instruct and demonstrate the movement.
Instruction
Rotate your ankle as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742499051', 'vald', NULL, false, true, 'vald'),
('ankle-inversion-long-sitting-plantigrade-rom', 'Ankle inversion ROM', 'Ankle', 'RangeofMotion', 'Inversion', 'LongSittingPlantigrade', 'Long Sitting - Plantigrade', 'Bilateral', 'rom', 0, false, 'Patient position
Long sitting with their lower leg extending past the table, allowing the ankle to be unsupported, in a neutral / plantigrade position.
Contact point
Fixated along the lateral aspect of the patient''s foot.
Device orientation
Vertical, consistent with the plantigrade position maintained by the patient.
Position of examiner
Seated at the foot of the bed, medial to the leg being tested, in a position to instruct and demonstrate the movement.
Instruction
Rotate your ankle as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742499077', 'vald', NULL, false, true, 'vald'),
('ankle-eversion-seated-rom', 'Ankle eversion ROM', 'Ankle', 'RangeofMotion', 'Eversion', 'Seated', 'Seated', 'Bilateral', 'rom', 0, false, 'Patient position
Sitting off the end of the table with their hips and knees both at 90 degrees flexion and ankle in a neutral position.
Contact point
Fixated along the lateral aspect of the patient''s foot.
Device orientation
Horizontal, consistent with the position of the patient''s foot.
Position of examiner
Seated or kneeling in front of the patient, in a position to instruct and demonstrate the movement.
Instruction
Rotate your ankle as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742503375', 'vald', NULL, false, true, 'vald'),
('ankle-eversion-long-sitting-plantigrade-rom', 'Ankle eversion ROM', 'Ankle', 'RangeofMotion', 'Eversion', 'LongSittingPlantigrade', 'Long Sitting - Plantigrade', 'Bilateral', 'rom', 0, false, 'Patient position
Long sitting with their lower leg extending past the table, allowing the ankle to be unsupported, in a neutral / plantigrade position.
Contact point
Fixated along the lateral aspect of the patient''s foot.
Device orientation
Vertical, consistent with the plantigrade position maintained by the patient.
Position of examiner
Seated at the foot of the bed, medial to the leg being tested, in a position to instruct and demonstrate the movement.
Instruction
Rotate your ankle as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742503251', 'vald', NULL, false, true, 'vald'),
('ankle-inversion-eversion-seated-rom', 'Ankle inversion / eversion ROM', 'Ankle', 'RangeofMotion', 'InversionEversion', 'Seated', 'Seated', 'Bilateral', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('ankle-inversion-eversion-long-sitting-plantigrade-rom', 'Ankle inversion / eversion ROM', 'Ankle', 'RangeofMotion', 'InversionEversion', 'LongSittingPlantigrade', 'Long Sitting - Plantigrade', 'Bilateral', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('ankle-dorsiflexion-seated-rom', 'Ankle dorsiflexion ROM', 'Ankle', 'RangeofMotion', 'Dorsiflexion', 'Seated', 'Seated', 'Bilateral', 'rom', 0, false, 'Patient position
Sitting off the end of the table with their hips and knees both at 90 degrees flexion and ankle in a neutral position.
Contact point
Fixated along the lateral aspect of the patient''s foot.
Device orientation
Horizontal, consistent with the position of the patient''s foot.
Position of examiner
Seated or kneeling in front of the patient, in a position to instruct and demonstrate the movement.
Instruction
Bring your toes toward your body as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742503217', 'vald', NULL, false, true, 'vald'),
('ankle-dorsiflexion-long-sitting-plantigrade-rom', 'Ankle dorsiflexion ROM', 'Ankle', 'RangeofMotion', 'Dorsiflexion', 'LongSittingPlantigrade', 'Long Sitting - Plantigrade', 'Bilateral', 'rom', 0, false, 'Patient position
Long sitting with their lower leg extending past the table, allowing the ankle to be unsupported, in a neutral / plantigrade position.
Contact point
Fixated along the lateral aspect of the patient''s foot.
Device orientation
Vertical, consistent with the plantigrade position maintained by the patient.
Position of examiner
Seated at the foot of the bed, medial to the leg being tested, in a position to instruct and demonstrate the movement.
Instruction
Bring your toes toward your body as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/742503176', 'vald', NULL, false, true, 'vald'),
('ankle-plantar-flexion-seated-rom', 'Ankle plantar flexion ROM', 'Ankle', 'RangeofMotion', 'PlantarFlexion', 'Seated', 'Seated', 'Bilateral', 'rom', 0, false, 'Patient position
Sitting off the end of the table with their hips and knees both at 90 degrees flexion and ankle in a neutral position.
Contact point
Fixated along the lateral aspect of the patient''s foot.
Device orientation
Horizontal, consistent with the position of the patient''s foot.
Position of examiner
Seated or kneeling in front of the patient, in a position to instruct and demonstrate the movement.
Instruction
Move your toes away from your body as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', NULL, NULL, NULL, false, true, 'vald'),
('ankle-plantar-flexion-long-sitting-plantigrade-rom', 'Ankle plantar flexion ROM', 'Ankle', 'RangeofMotion', 'PlantarFlexion', 'LongSittingPlantigrade', 'Long Sitting - Plantigrade', 'Bilateral', 'rom', 0, false, 'Patient position
Long sitting with their lower leg extending past the table, allowing the ankle to be unsupported, in a neutral / plantigrade position.
Contact point
Fixated along the lateral aspect of the patient''s foot.
Device orientation
Vertical, consistent with the plantigrade position maintained by the patient.
Position of examiner
Seated at the foot of the bed, medial to the leg being tested, in a position to instruct and demonstrate the movement.
Instruction
Move your toes away from your body as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
ROM strap.', 'https://player.vimeo.com/video/744397874', 'vald', NULL, false, true, 'vald'),
('ankle-dorsiflexion-plantar-flexion-seated-rom', 'Ankle dorsiflexion / plantar flexion ROM', 'Ankle', 'RangeofMotion', 'DorsiflexionPlantarFlexion', 'Seated', 'Seated', 'Bilateral', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('ankle-dorsiflexion-plantar-flexion-long-sitting-plantigrade-rom', 'Ankle dorsiflexion / plantar flexion ROM', 'Ankle', 'RangeofMotion', 'DorsiflexionPlantarFlexion', 'LongSittingPlantigrade', 'Long Sitting - Plantigrade', 'Bilateral', 'rom', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald'),
('foot-toe-flexion-seated', 'Foot toe flexion', 'Foot', 'Strength', 'ToeFlexion', 'Seated', 'Seated', 'Bilateral', 'force', 0, false, 'Patient Position
Seated on the edge of the bed with feet not touching the floor, hands rested on their thighs and hips and knees each at 90 degrees flexion.
Contact Point
Fixated along the lateral aspect of the patient''s lower leg.
Device Orientation
Vertical, parallel to the tibia.
Position of Examiner
Split kneeling in front of the patient, supporting the patient''s lower leg with one hand and the DynaMo with the other, using the floor to block movement, resisting downward force
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Palm pad and Flat pad', NULL, NULL, NULL, false, true, 'vald'),
('foot-toe-flexion-long-sitting-plantar-flexed', 'Foot toe flexion', 'Foot', 'Strength', 'ToeFlexion', 'LongSittingPlantarFlexed', 'Long Sitting - Plantar Flexed', 'Bilateral', 'force', 0, false, 'Patient Position
Long sitting with their lower leg extending past the table, allowing the ankle to be unsupported.
Contact Point
Fixated along the lateral aspect of the patient''s lower leg.
Device Orientation
Vertical, parallel to the tibia.
Position of Examiner
Seated at the foot of the bed, medial to the leg being tested, supporting the patient just proximal to their ankle with one hand, and holding the DynaMo with the other.
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Palm pad and Curved Pad', NULL, NULL, NULL, false, true, 'vald'),
('foot-toe-flexion-long-sitting-plantigrade', 'Foot toe flexion', 'Foot', 'Strength', 'ToeFlexion', 'LongSittingPlantigrade', 'Long Sitting - Plantigrade', 'Bilateral', 'force', 0, false, 'Patient Position
Long sitting with their lower leg extending past the table, allowing the ankle to be unsupported.
Contact Point
Plantar surface of the big toe.
Device Orientation
Horizontal, with the palm pad supported by the assessor and the curved pad in contact with the patient.
Position of Examiner
Seated at the foot of the bed, medial to the leg being tested, supporting the patient just proximal to their ankle with one hand, and holding the DynaMo with the other.
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Palm pad and Curved Pad', NULL, NULL, NULL, false, true, 'vald'),
('foot-toe-extension-seated', 'Foot toe extension', 'Foot', 'Strength', 'ToeExtension', 'Seated', 'Seated', 'Bilateral', 'force', 0, false, 'Patient Position
Seated on the edge of the bed with feet not touching the floor, hands rested on their thighs and hips and knees each at 90 degrees flexion.
Contact Point
Dorsal surface of the great toe.
Device Orientation
Vertical, with the palm pad supported by the assessor and the curved pad in contact with the patient.
Position of Examiner
Kneeling in front of the patient, supporting the patient''s ankle with one hand and the DynaMo with the other, resisting upward force
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Palm pad and Flat pad', NULL, NULL, NULL, false, true, 'vald'),
('foot-toe-extension-long-sitting-plantar-flexed', 'Foot toe extension', 'Foot', 'Strength', 'ToeExtension', 'LongSittingPlantarFlexed', 'Long Sitting - Plantar Flexed', 'Bilateral', 'force', 0, false, 'Patient Position
Long sitting with their lower leg extending past the table, allowing the ankle to be unsupported.
Contact Point
Posterior aspect of the forearm, just proximal to the wrist.
Device Orientation
Vertical, with the palm pad supported by the assessor and the curved pad in contact with the patient.
Position of Examiner
Sitting beside the patient, holding the DynaMo with one hand, applying upward pressure and supporting the patient to ensure they remain stable with the other hand.
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Palm pad and Curved Pad', NULL, NULL, NULL, false, true, 'vald'),
('foot-toe-extension-long-sitting-plantigrade', 'Foot toe extension', 'Foot', 'Strength', 'ToeExtension', 'LongSittingPlantigrade', 'Long Sitting - Plantigrade', 'Bilateral', 'force', 0, false, 'Patient Position
Long sitting with their lower leg extending past the table, allowing the ankle to be unsupported.
Contact Point
Dorsal surface of the big toe.
Device Orientation
Horizontal, with the palm pad supported by the assessor and the curved pad in contact with the patient.
Position of Examiner
Seated at the foot of the bed, medial to the leg being tested, supporting the patient just proximal to their ankle with one hand, and holding the DynaMo with the other.
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Palm pad and Curved Pad', NULL, NULL, NULL, false, true, 'vald'),
('scapula-protraction-standing', 'Scapula protraction', 'Scapula', 'Strength', 'Protraction', 'Standing', 'Standing', 'Bilateral', 'force', 0, false, 'Patient position
Supine with the arm being tested at 90 degrees shoulder flexion, elbow extended, forearm in neutral and hand in a clenched fist.
Contact point
Dorsal aspect of the proximal phalanges.
Device orientation
Vertical, with the practitioner end up and the palm pad supported by the practitioner, and the curved pad in contact with the patient.
Position of examiner
Standing adjacent to the patient, supporting the DynaMo Plus with both hands.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad and curved pad.', 'https://player.vimeo.com/video/742519920', 'vald', NULL, false, true, 'vald'),
('scapula-retraction-standing', 'Scapula retraction', 'Scapula', 'Strength', 'Retraction', 'Standing', 'Standing', 'Bilateral', 'force', 0, false, 'Patient position
Seated, with the arm being assessed in 90 degrees shoulder flexion, elbow extension and forearm in neutral.
Contact point
Patient holding the hand attachment.
Device orientation
Horizontal, connected to the hand attachment at one end and connected to a fixed surface via the adjustable strap at the other.
Position of examiner
Standing adjacent to the patient, in a position to instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Hand grip and adjustable strap.', 'https://player.vimeo.com/video/742519962', 'vald', NULL, false, true, 'vald'),
('neck-flexion-supine', 'Neck flexion', 'Neck', 'Strength', 'Flexion', 'Supine', 'Supine', 'None', 'force', 0, false, 'Patient position
Supine, with their arms crossed, and their head extending past the edge of the table so that it remains unsupported.
Contact point
Circumference of the patient''s head via the cable strap.
Device orientation
Vertical, with the cable strap around the patient''s head and the hand attachment held by the practitioner, posterior to the patient''s head.
Position of examiner
Standing adjacent to the patient''s head, supporting the DynaMo Plus with both hands.
Instruction
Pull the DynaMo Plus as hard as you can. 3, 2, 1 - pull, pull, pull and relax.
Attachments
Hand attachment and cable strap.', 'https://player.vimeo.com/video/742519507', 'vald', NULL, false, true, 'vald'),
('shoulder-flexion-seated-rom', 'Shoulder flexion ROM', 'Shoulder', 'RangeofMotion', 'Flexion', 'Seated', 'Seated', 'Bilateral', 'rom', 0, false, 'Patient position
Sitting at the edge of the table with their arm being assessed by their side, elbow extended and forearm in a neutral position.
Contact point
Held in patient''s hand.
Device orientation
Vertical, consistent with the position of the patient''s hand.
Position of examiner
Seated adjacent to the patient, on the same side as the arm being tested, in a position to instruct and demonstrate the movement.
Instruction
Flex your shoulder as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
No attachment.', 'https://player.vimeo.com/video/742533763', 'vald', NULL, false, true, 'vald'),
('shoulder-extension-seated-rom', 'Shoulder extension ROM', 'Shoulder', 'RangeofMotion', 'Extension', 'Seated', 'Seated', 'Bilateral', 'rom', 0, false, 'Patient position
Sitting off the edge of the table so that their arm being assessed remains at their side with their elbow extended and forearm in neutral, allowing the hand to hang down without contacting the table.
Contact point
Held in patient''s hand.
Device orientation
Horizontal, consistent with the position of the patient''s hand.
Position of examiner
Seated adjacent to or in front of the patient, in a position to instruct and demonstrate the movement.
Instruction
Extend your shoulder as far as you can, keeping the DynaMo Plus as still as possible.
Attachments
No attachment.', 'https://player.vimeo.com/video/742520882', 'vald', NULL, false, true, 'vald'),
('shoulder-abduction-seated-rom', 'Shoulder abduction ROM', 'Shoulder', 'RangeofMotion', 'Abduction', 'Seated', 'Seated', 'Bilateral', 'rom', 0, false, 'Patient position
Seated at the edge of the bed so that their arm being assessed remains at their side with their elbow extended and forearm supinated, allowing the hand to hang down without contacting the bed.
Contact point
Fixed superior to the wrist.
Device orientation
Vertical, consistent with the position of the patient''s hand.
Position of examiner
Seated adjacent to or in front of the patient, in a position to instruct and demonstrate the movement.
Instruction
Abduct your shoulder as far as you can, keeping the DynaMo Lite as still as possible, taking care not to change your wrist position.', 'https://player.vimeo.com/video/795101775', 'vald', NULL, false, true, 'vald'),
('hip-flexion-supine-long-lever', 'Hip flexion', 'Hip', 'Strength', 'Flexion', 'SupineLongLever', 'Supine (Long Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Supine with the leg being tested in full extension and the opposite leg bent in a hook-lying position.
Contact point
Distal aspect of the anterior shank.
Device orientation
Vertical, with the curved pad in contact with the patient and the palm pad supported by the practitioner.
Position of examiner
Standing adjacent to the leg being tested, supporting the DynaMo with both hands.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, Palm pad.', NULL, NULL, NULL, false, true, 'vald'),
('hip-flexion-supine-long-lever-rom', 'Hip flexion ROM', 'Hip', 'RangeofMotion', 'Flexion', 'SupineLongLever', 'Supine (Long Lever)', 'Bilateral', 'rom', 0, false, 'Patient position
Supine with the leg being tested in full extension.
Contact point
Fixated to the lateral aspect of the femur, just proximal to the knee.
Device orientation
Horizontal, fixed to the patient''s thigh with the ROM strap.
Position of examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
While keeping your knee straight, flex your hip as far as you can.
Attachments
ROM strap.', NULL, NULL, NULL, false, true, 'vald'),
('hip-flexion-kicker-standing', 'Hip flexion - kicker', 'Hip', 'Strength', 'FlexionKicker', 'Standing', 'Standing', 'Bilateral', 'force', 0, false, 'Patient position
Standing on the contralateral leg, with the involved leg in slight hip and knee flexion.
Contact point
Dorsal aspect of the foot.
Device orientation
Horizontal with one end attached to a fixed object directly posterior to the leg being tested, and the other end attached to the patient''s leg via tension link and ankle strap.
Position of examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Pull against the DynaMo as hard as you can. 3, 2, 1 - pull, pull, pull and relax.
Attachments
Tension links, Carabiners, Ankle strap.', NULL, NULL, NULL, false, true, 'vald'),
('hip-adduction-standing', 'Hip adduction', 'Hip', 'Strength', 'Adduction', 'Standing', 'Standing', 'Bilateral', 'force', 0, false, 'Patient position
Standing with arms supported by a stable surface.
Contact point
Medial aspect of the patient''s lower leg, just proximal to the medial malleolus.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Seated or kneeling in front of the patient, lateral to the leg being tested, with one hand supporting the DynaMo and resisting lateral force, with the other hand supporting the patient''s upper leg to ensure minimal movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', NULL, NULL, NULL, false, true, 'vald'),
('ankle-dorsiflexion-standing-rom', 'Ankle dorsiflexion ROM', 'Ankle', 'RangeofMotion', 'Dorsiflexion', 'Standing', 'Standing', 'Bilateral', 'rom', 0, false, 'Patient position
Standing upright with shin vertical and arms supported on a fixed surface following the knee to wall protocol.
Contact point
Fixated along the lateral aspect of the patient''s lower leg.
Device orientation
Vertical, parallel to the tibia.
Position of examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Shift your weight as far forward as you can, while keeping your foot flat on the floor.
Attachments
ROM strap.', NULL, NULL, NULL, false, true, 'vald'),
('ankle-dorsiflexion-half-kneeling-rom', 'Ankle dorsiflexion ROM', 'Ankle', 'RangeofMotion', 'Dorsiflexion', 'HalfKneeling', 'Half Kneeling', 'Bilateral', 'rom', 0, false, 'Patient position
Half kneeling position with shin vertical and arms supported on a fixed surface. Following the knee to wall protocol.
Contact point
Fixated along the lateral aspect of the patient''s lower leg.
Device orientation
Vertical, parallel to the tibia.
Position of examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Shift your weight as far forward as you can, whilst keeping your foot flat on the floor.
Attachments
ROM strap.', NULL, NULL, NULL, false, true, 'vald'),
('hand-pinch-grip-seated', 'Hand pinch grip', 'Hand', 'Strength', 'PinchGrip', 'Seated', 'Seated', 'Bilateral', 'force', 0, false, 'Patient position
Seated with arm resting on a flat surface and wrist in a neutral position.
Contact point
Held in patient''s hand, with thumb on inner grip attachment and four fingers on the outer attachment.
Device orientation
Vertical, with practitioner supporting the device.
Position of examiner
In a position to support the device so that the patient can apply maximal pinch force.
Instruction
Squeeze the grip attachment as hard as you can. 3, 2, 1 - pull, pull, pull and relax.
Attachments
Grip.', NULL, NULL, NULL, true, true, 'vald'),
('hand-thumb-push-seated', 'Hand thumb push', 'Hand', 'Strength', 'ThumbPush', 'Seated', 'Seated', 'Bilateral', 'force', 0, false, 'Patient position
Seated with arm resting on a flat surface and wrist in a neutral position.
Contact point
Thumb on flat pad with practitioner supporting the device.
Device orientation
Vertical, with practitioner supporting the device.
Position of examiner
In a position to support the device so that the patient can apply maximal force.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Flat pad, palm pad.', NULL, NULL, NULL, true, true, 'vald'),
('hand-grip-squeeze-overhead', 'Hand grip squeeze', 'Hand', 'Strength', 'GripSqueeze', 'Overhead', 'Overhead', 'Bilateral', 'force', 0, true, 'Patient position
Standing with arm being tested at 180 degrees of flexion, with the forearm neutral and the contralateral arm relaxed at the side.
Contact point
Held in patient''s hand.
Device orientation
Vertical, in the grip strength assessment configuration.
Position of examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Squeeze against the attachment as hard as you can. 3, 2, 1 - squeeze, squeeze, squeeze and relax.
Attachments
Grip.', NULL, NULL, NULL, false, true, 'vald'),
('hip-abduction-standing', 'Hip abduction', 'Hip', 'Strength', 'Abduction', 'Standing', 'Standing', 'Bilateral', 'force', 0, false, 'Patient position
Standing with arms supported by a stable surface.
Contact point
Lateral aspect of the patient''s lower leg, just proximal to the lateral malleolus.
Device orientation
Horizontal, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Seated or kneeling in front of the patient, lateral to the leg being tested, with one hand supporting the DynaMo and resisting lateral force, with the other hand supporting the patient''s upper leg to ensure minimal movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', NULL, NULL, NULL, false, true, 'vald'),
('hip-extension-supine-long-lever', 'Hip extension', 'Hip', 'Strength', 'Extension', 'SupineLongLever', 'Supine (Long Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Supine on the bed with leg being tested in full extension.
Contact point
Posterior aspect of the patient''s lower leg, just proximal to the ankle.
Device orientation
Palm pad supported by the examiner and the curved pad in contact with the patient.
Position of examiner
Standing adjacent to the bed on the side of the tested leg, with two hands supporting the DynaMo, resisting upward force.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, palm pad.', NULL, NULL, NULL, false, true, 'vald'),
('knee-extension-prone-30-degree-knee-flexion', 'Knee extension', 'Knee', 'Strength', 'Extension', 'Prone30DegreeKneeFlexion', 'Prone - 30 Degree Knee Flexion', 'Bilateral', 'force', 0, false, 'Patient position
Prone with the knee at 30 degrees of flexion.
Contact point
Posterior aspect of the ankle attachment, at the hook closest to the achilles tendon.
Device orientation
Horizontal, linked to the ankle strap at one end and anchored to a fixed surface by the cable strap at the other, posterior to the patient''s leg being tested.
Position of examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Pull against the DynaMo as hard as you can. 3, 2, 1 - pull, pull, pull and relax.
Attachments
Tension links, Carabiners, Ankle strap, Tension strap.', NULL, NULL, NULL, false, true, 'vald'),
('knee-extension-prone-45-degree-knee-flexion', 'Knee extension', 'Knee', 'Strength', 'Extension', 'Prone45DegreeKneeFlexion', 'Prone - 45 Degree Knee Flexion', 'Bilateral', 'force', 0, false, 'Patient position
Prone with the knee at 45 degrees of flexion.
Contact point
Posterior aspect of the ankle attachment, at the hook closest to the achilles tendon.
Device orientation
Horizontal, linked to the ankle strap at one end and anchored to a fixed surface by the cable strap at the other, posterior to the patient''s leg being tested.
Position of examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Pull against the DynaMo as hard as you can. 3, 2, 1 - pull, pull, pull and relax.
Attachments
Tension links, Carabiners, Ankle strap, Tension strap.', NULL, NULL, NULL, false, true, 'vald'),
('knee-extension-prone-60-degree-knee-flexion', 'Knee extension', 'Knee', 'Strength', 'Extension', 'Prone60DegreeKneeFlexion', 'Prone - 60 Degree Knee Flexion', 'Bilateral', 'force', 0, false, 'Patient position
Prone with the knee at 60 degrees of flexion.
Contact point
Posterior aspect of the ankle attachment, at the hook closest to the achilles tendon.
Device orientation
Horizontal, linked to the ankle strap at one end and anchored to a fixed surface by the cable strap at the other, posterior to the patient''s leg being tested.
Position of examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Pull against the DynaMo as hard as you can. 3, 2, 1 - pull, pull, pull and relax.
Attachments
Tension links, Carabiners, Ankle strap, Tension strap.', NULL, NULL, NULL, false, true, 'vald'),
('knee-extension-seated-30-degree-knee-flexion', 'Knee extension', 'Knee', 'Strength', 'Extension', 'Seated30DegreeKneeFlexion', 'Seated - 30 Degree Knee Flexion', 'Bilateral', 'force', 0, false, 'Patient Position
Seated on the edge of the table with feet not in contact with the ground and the knee at 30 degrees of flexion.
Contact Point
Posterior aspect of the ankle attachment, at the achilles tendon.
Device Orientation
Horizontal, linked to the ankle strap at one end and anchored to a fixed surface by the Tension Strap.
Position of Examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Pull against the DynaMo as hard as you can 3, 2, 1 - pull, pull, pull and relax
Attachments
Tension Strap and Ankle Attachment', 'https://player.vimeo.com/video/999140148', 'vald', NULL, false, true, 'vald'),
('knee-extension-seated-45-degree-knee-flexion', 'Knee extension', 'Knee', 'Strength', 'Extension', 'Seated45DegreeKneeFlexion', 'Seated - 45 Degree Knee Flexion', 'Bilateral', 'force', 0, false, 'Patient Position
Seated on the edge of the table with feet not in contact with the ground and the knee at 45 degrees of flexion.
Contact Point
Posterior aspect of the ankle attachment, at the achilles tendon.
Device Orientation
Horizontal, linked to the ankle strap at one end and anchored to a fixed surface by the Tension Strap.
Position of Examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Pull against the DynaMo as hard as you can 3, 2, 1 - pull, pull, pull and relax
Attachments
Tension Strap and Ankle Attachment', 'https://player.vimeo.com/video/999140168', 'vald', NULL, false, true, 'vald'),
('knee-extension-seated-60-degree-knee-flexion', 'Knee extension', 'Knee', 'Strength', 'Extension', 'Seated60DegreeKneeFlexion', 'Seated - 60 Degree Knee Flexion', 'Bilateral', 'force', 0, false, 'Patient Position
Seated on the edge of the table with feet not in contact with the ground and the knee at 60 degrees of flexion.
Contact Point
Posterior aspect of the ankle attachment, at the achilles tendon.
Device Orientation
Horizontal, linked to the ankle strap at one end and anchored to a fixed surface by the Tension Strap.
Position of Examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Pull against the DynaMo as hard as you can 3, 2, 1 - pull, pull, pull and relax
Attachments
Tension Strap and Ankle Attachment', 'https://player.vimeo.com/video/999140205', 'vald', NULL, false, true, 'vald'),
('knee-extension-supine-long-lever-rom', 'Knee extension ROM', 'Knee', 'RangeofMotion', 'Extension', 'SupineLongLever', 'Supine (Long Lever)', 'Bilateral', 'rom', -90, false, 'Patient position
Supine at the end of the table with their hips and knees both at 90 degrees flexion.
Contact point
Fixated along the lateral aspect of the patient''s lower leg.
Device orientation
Vertical, consistent with the position of the patient''s leg.
Position of examiner
Seated or kneeling in front of the patient, in a position to instruct and demonstrate the movement.
Instruction
Extend and straighten your knee as far as you can, keeping the DynaMo as still as possible.
Attachments
ROM strap.', NULL, NULL, NULL, false, true, 'vald'),
('knee-flexion-seated-30-degree-knee-flexion', 'Knee flexion', 'Knee', 'Strength', 'Flexion', 'Seated30DegreeKneeFlexion', 'Seated - 30 Degree Knee Flexion', 'Bilateral', 'force', 0, false, 'Patient position
Seated on the edge of the table, with feet not in contact with the ground and knee at 30 degrees of flexion.
Contact point
Anterior aspect of the ankle attachment, at the hook closest to the front of the ankle joint.
Device orientation
Horizontal, linked to the ankle strap at one end and anchored to a fixed surface by the cable strap at the other, anterior to the patient''s leg being tested.
Position of examiner
Seated next to the patient in a position to orient the DynaMo, instruct and demonstrate the movement.
Instruction
Pull against the DynaMo as hard as you can. 3, 2, 1 - pull, pull, pull and relax.
Attachments
Tension links, Carabiners, Ankle strap, Tension strap.', NULL, NULL, NULL, false, true, 'vald'),
('knee-flexion-seated-45-degree-knee-flexion', 'Knee flexion', 'Knee', 'Strength', 'Flexion', 'Seated45DegreeKneeFlexion', 'Seated - 45 Degree Knee Flexion', 'Bilateral', 'force', 0, false, 'Patient position
Seated on the edge of the table, with feet not in contact with the ground and knee at 45 degrees of flexion.
Contact point
Anterior aspect of the ankle attachment, at the hook closest to the front of the ankle joint.
Device orientation
Horizontal, linked to the ankle strap at one end and anchored to a fixed surface by the cable strap at the other, anterior to the patient''s leg being tested.
Position of examiner
Seated next to the patient in a position to orient the DynaMo, instruct and demonstrate the movement.
Instruction
Pull against the DynaMo as hard as you can. 3, 2, 1 - pull, pull, pull and relax.
Attachments
Tension links, Carabiners, Ankle strap, Tension strap.', NULL, NULL, NULL, false, true, 'vald'),
('knee-flexion-seated-60-degree-knee-flexion', 'Knee flexion', 'Knee', 'Strength', 'Flexion', 'Seated60DegreeKneeFlexion', 'Seated - 60 Degree Knee Flexion', 'Bilateral', 'force', 0, false, 'Patient position
Seated on the edge of the table, with feet not in contact with the ground and knee at 60 degrees of flexion.
Contact point
Anterior aspect of the ankle attachment, at the hook closest to the front of the ankle joint.
Device orientation
Horizontal, linked to the ankle strap at one end and anchored to a fixed surface by the cable strap at the other, anterior to the patient''s leg being tested.
Position of examiner
Seated next to the patient in a position to orient the DynaMo, instruct and demonstrate the movement.
Instruction
Pull against the DynaMo as hard as you can. 3, 2, 1 - pull, pull, pull and relax.
Attachments
Tension links, Carabiners, Ankle strap, Tension strap.', NULL, NULL, NULL, false, true, 'vald'),
('knee-flexion-supine-30-degree-knee-flexion', 'Knee flexion', 'Knee', 'Strength', 'Flexion', 'Supine30DegreeKneeFlexion', 'Supine - 30 Degree Knee Flexion', 'Bilateral', 'force', 0, false, 'Patient position
Supine with the knee at 30 degrees of flexion.
Contact point
Anterior aspect of the ankle attachment, at the hook closest to the front of the ankle joint.
Device orientation
Horizontal, linked to the ankle strap at one end and anchored to a fixed surface by the cable strap at the other, anterior to the patient''s leg being tested.
Position of examiner
Seated next to the patient in a position to orient the DynaMo, instruct and demonstrate the movement.
Instruction
Pull against the DynaMo as hard as you can. 3, 2, 1 - pull, pull, pull and relax.
Attachments
Tension links, Carabiners, Ankle strap, Tension strap.', NULL, NULL, NULL, false, true, 'vald'),
('knee-flexion-supine-45-degree-knee-flexion', 'Knee flexion', 'Knee', 'Strength', 'Flexion', 'Supine45DegreeKneeFlexion', 'Supine - 45 Degree Knee Flexion', 'Bilateral', 'force', 0, false, 'Patient position
Supine with the knee at 45 degrees of flexion.
Contact point
Anterior aspect of the ankle attachment, at the hook closest to the front of the ankle joint.
Device orientation
Horizontal, linked to the ankle strap at one end and anchored to a fixed surface by the cable strap at the other, anterior to the patient''s leg being tested.
Position of examiner
Seated next to the patient in a position to orient the DynaMo, instruct and demonstrate the movement.
Instruction
Pull against the DynaMo as hard as you can. 3, 2, 1 - pull, pull, pull and relax.
Attachments
Tension links, Carabiners, Ankle strap, Tension strap.', NULL, NULL, NULL, false, true, 'vald'),
('knee-flexion-supine-60-degree-knee-flexion', 'Knee flexion', 'Knee', 'Strength', 'Flexion', 'Supine60DegreeKneeFlexion', 'Supine - 60 Degree Knee Flexion', 'Bilateral', 'force', 0, false, 'Patient position
Supine with the knee at 60 degrees of flexion.
Contact point
Anterior aspect of the ankle attachment, at the hook closest to the front of the ankle joint.
Device orientation
Horizontal, linked to the ankle strap at one end and anchored to a fixed surface by the cable strap at the other, anterior to the patient''s leg being tested.
Position of examiner
Seated next to the patient in a position to orient the DynaMo, instruct and demonstrate the movement.
Instruction
Pull against the DynaMo as hard as you can. 3, 2, 1 - pull, pull, pull and relax.
Attachments
Tension links, Carabiners, Ankle strap, Tension strap.', NULL, NULL, NULL, false, true, 'vald'),
('scapula-scaption-p-90-degrees-shoulder-abduction', 'Scapula scaption', 'Scapula', 'Strength', 'Scaption', 'p90DegreesShoulderAbduction', '90 Degrees Shoulder Abduction', 'Bilateral', 'force', 0, false, 'Patient position
Seated with arm being tested extended and elevated to 90 degrees in a scapular plane and forearm in neutral.
Contact point
Distal aspect of the lateral upper arm, just proximal to the elbow.
Device orientation
Vertical, with the practitioner supporting the flat surface from above and the curved pad in contact with the patient.
Position of examiner
Standing adjacent to the arm being tested.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-abduction-supine-rom', 'Shoulder abduction ROM', 'Shoulder', 'RangeofMotion', 'Abduction', 'Supine', 'Supine', 'Bilateral', 'rom', 0, false, 'Patient position
Supine with the arm being tested resting at patient''s side with elbow extended and forearm in a neutral position.
Contact point
Held in patient''s hand.
Device orientation
Vertical, consistent with the position of the patient''s hand.
Position of examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Move your shoulder away from your body as far as you can, keeping the DynaMo as still as possible.
Attachments
None.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-abduction-side-lying-rom', 'Shoulder abduction ROM', 'Shoulder', 'RangeofMotion', 'Abduction', 'SideLying', 'Side Lying', 'Bilateral', 'rom', 0, false, 'Patient position
Side lying on non-testing side with the arm being tested resting at the patient''s side with elbow extended and forarem supinated.
Contact point
Held in patient''s hand.
Device orientation
Horizontal, consistent with the position of the patient''s hand.
Position of examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Move your shoulder away from your body as far as you can, keeping the DynaMo as still as possible.
Attachments
None.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-abduction-supine', 'Shoulder abduction', 'Shoulder', 'Strength', 'Abduction', 'Supine', 'Supine', 'Bilateral', 'force', 0, false, 'Patient position
Supine with the arm being tested resting at the patient''s side wtih elbow extended and forearm in a neutral position.
Contact point
Distal aspect of the posterior forearm, just proximal to the wrist.
Device orientation
Horizontal, with the palm pad supported be the practitioner and the curved pad in contact with the patient.
Position of examiner
Sitting beside the patient, applying lateral pressure and supporting the patient to ensure they remain stable.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, Palm pad.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-abduction-seated-45-degrees-shoulder-abduction-short-lever', 'Shoulder abduction', 'Shoulder', 'Strength', 'Abduction', 'Seated45DegreesShoulderAbductionShortLever', 'Seated - 45 Degrees Shoulder Abduction (Short Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Seated with feet on the floor, their elbow bent to 90 degrees and arm abducted to 45 degrees, with their forearm in a neutral position.
Contact point
Distal aspect of the lateral upper arm, just proximal to the elbow.
Device orientation
Horizontal, with the palm pad supported by the practitioner, and the curved pad in contact with the patient.
Position of examiner
Adjacent to the patient, in a position to support and apply downward pressure to the DynaMo with both hands.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad, Curved pad.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-adduction-standing-rom', 'Shoulder adduction ROM', 'Shoulder', 'RangeofMotion', 'Adduction', 'Standing', 'Standing', 'Bilateral', 'rom', 0, false, 'Patient position
Standing with the arm being tested resting at the patient''s side and slightly flexed with elbow extended and forearm supinated.
Contact point
Held in patient''s hand.
Device orientation
Horizontal, consistent with the position of the patient''s hand.
Position of examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Move your shoulder inwards as far as you can, keeping the DynaMo as still as possible.
Attachments
None.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-extension-standing', 'Shoulder extension', 'Shoulder', 'Strength', 'Extension', 'Standing', 'Standing', 'Bilateral', 'force', 0, false, 'Patient position
Standing upright, with their arm being tested at their side and forearm in pronated, in front of a fixed surface.
Contact point
Anterior aspect of the forearm, just proximal to the wrist.
Device orientation
Horizontal, with the curved pad in contact with the patient and the flat pad in contact with a fixed surface.
Position of examiner
Standing next to the patient in position to place the DynaMo Plus, instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Flat pad and palm pad.', 'https://player.vimeo.com/video/742521331', 'vald', NULL, true, true, 'vald'),
('shoulder-extension-prone-rom', 'Shoulder extension ROM', 'Shoulder', 'RangeofMotion', 'Extension', 'Prone', 'Prone', 'Bilateral', 'rom', 0, false, 'Patient position
Prone with the arm being tested at the patient''s side, elbow extended and forearm pronated.
Contact point
Held in patient''s hand.
Device orientation
Horizontal, consistent with the position of the patient''s hand.
Position of examiner
Seated adjacent to the patient, on the same side as the arm being tested, in a position to instruct and demonstrate the movement.
Instruction
None.
Attachments
ATTACHMENTSHERE', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-external-rotation-seated-elbow-90-degrees-90-degree-shoulder-abduction-rom', 'Shoulder external rotation ROM', 'Shoulder', 'RangeofMotion', 'ExternalRotation', 'SeatedElbow90Degrees90DegreeShoulderAbduction', 'Seated - Elbow 90 Degrees, 90 Degree Shoulder Abduction', 'Bilateral', 'rom', 0, false, 'Patient position
Sitting at the edge of the bed with their arm being assessed in 90 degrees shoulder abduction, elbow bent to 90 degrees and forearm in a neutral position.
Contact point
Fixed superior to the wrist.
Device orientation
Horizontal, consistent with the position of the patient''s hand.
Position of examiner
Seated adjacent to the patient, on the same side as the arm being tested, in a position to instruct and demonstrate the movement.
Instruction
Rotate your arm outwards as far as you can, keeping the DynaMo Lite as still as possible.', 'https://player.vimeo.com/video/795101917', 'vald', NULL, false, true, 'vald'),
('shoulder-external-rotation-seated-45-degrees-shoulder-abduction-long-lever', 'Shoulder external rotation', 'Shoulder', 'Strength', 'ExternalRotation', 'Seated45DegreesShoulderAbductionLongLever', 'Seated - 45 Degrees Shoulder Abduction (Long Lever)', 'Bilateral', 'force', 0, false, 'Patient Position
Seated, with the shoulder being tested abducted to 45 degrees and elbow flexed 90 degrees, and elbow rested on a flat surface.
Contact Point
Posterior aspect of the forearm, just proximal to the wrist.
Device Orientation
Horizontal, with the palm pad supported by the assessor and the curved pad in contact with the patient.
Position of Examiner
Seated adjacent to the patient, on the same side as the arm being tested, supporting the DynaMo in one hand and the patient with the other.
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Palm pad and Curved Pad', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-external-rotation-supine-elbow-90-degrees-90-degree-shoulder-abduction-rom', 'Shoulder external rotation ROM', 'Shoulder', 'RangeofMotion', 'ExternalRotation', 'SupineElbow90Degrees90DegreeShoulderAbduction', 'Supine - Elbow 90 Degrees, 90 Degree Shoulder Abduction', 'Bilateral', 'rom', 0, false, 'Patient Position
Supine with the shoulder being tested abducted to 90 degrees and elbow flexed to 90 degrees.
Contact Point
Held in the patient''s hand.
Device Orientation
Held in the patient''s hand.
Position of Examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Rotate your arm outwards as far as you can, keeping the DynaMo as still as possible.
Attachments
No attachments.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-external-rotation-prone-elbow-90-degrees-90-degree-shoulder-abduction-rom', 'Shoulder external rotation ROM', 'Shoulder', 'RangeofMotion', 'ExternalRotation', 'ProneElbow90Degrees90DegreeShoulderAbduction', 'Prone - Elbow 90 Degrees, 90 Degree Shoulder Abduction', 'Bilateral', 'rom', 0, false, 'Patient Position
Prone with the shoulder being tested abducted to 90 degrees and elbow flexed to 90 degrees.
Contact Point
Held in the patient''s hand.
Device Orientation
Held in the patient''s hand.
Position of Examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Rotate your arm outwards as far as you can, keeping the DynaMo as still as possible.
Attachments
No attachments.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-external-rotation-rom', 'Shoulder external rotation ROM', 'Shoulder', 'RangeofMotion', 'ExternalRotation', 'StandingElbow90Degrees', 'Standing - Elbow 90 Degrees', 'Bilateral', 'rom', 0, false, 'Patient Position
Standing with elbow flexed to 90 degrees.
Contact Point
Held in the patient''s hand.
Device Orientation
Held in the patient''s hand.
Position of Examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Rotate your arm outwards as far as you can, keeping the DynaMo as still as possible.
Attachments
No attachments.', NULL, NULL, NULL, true, true, 'vald'),
('shoulder-external-rotation-standing-elbow-90-degrees-90-degree-shoulder-abduction-rom', 'Shoulder external rotation ROM', 'Shoulder', 'RangeofMotion', 'ExternalRotation', 'StandingElbow90Degrees90DegreeShoulderAbduction', 'Standing - Elbow 90 Degrees, 90 Degree Shoulder Abduction', 'Bilateral', 'rom', 0, false, 'Patient Position
Standing with the shoulder being tested abducted to 90 degrees and elbow flexed to 90 degrees.
Contact Point
Held in the patient''s hand.
Device Orientation
Held in the patient''s hand.
Position of Examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Rotate your arm outwards as far as you can, keeping the DynaMo as still as possible.
Attachments
No attachments.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-external-rotation-supine-elbow-90-degrees-rom', 'Shoulder external rotation ROM', 'Shoulder', 'RangeofMotion', 'ExternalRotation', 'SupineElbow90Degrees', 'Supine - Elbow 90 Degrees', 'Bilateral', 'rom', 0, false, 'Patient Position
Supine with the shoulder being tested abducted to 90 degrees and elbow flexed to 90 degrees.
Contact Point
Held in the patient''s hand.
Device Orientation
Held in the patient''s hand.
Position of Examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Rotate your arm outwards as far as you can, keeping the DynaMo as still as possible.
Attachments
No attachments.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-external-rotation-side-lying-rom', 'Shoulder external rotation ROM', 'Shoulder', 'RangeofMotion', 'ExternalRotation', 'SideLying', 'Side Lying', 'Bilateral', 'rom', 0, false, 'Patient position
Side lying on non-testing side with elbow flexed to 90 degrees.
Contact point
Held in patient''s hand.
Device orientation
Vertical, consistent with the position of the patient''s hand.
Position of examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Rotate your arm outwards as far as you can, keeping the DynaMo as still as possible.
Attachments
None.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-flexion-standing', 'Shoulder flexion', 'Shoulder', 'Strength', 'Flexion', 'Standing', 'Standing', 'Bilateral', 'force', 0, false, 'Patient position
Standing upright, with their arm being tested at their side and forearm in a neutral position, facing a fixed surface.
Contact point
Lateral aspect of the forearm, just proximal to the wrist.
Device orientation
Horizontal, with the curved pad in contact with the patient and the flat pad in contact with a fixed surface.
Position of examiner
Standing next to the patient in position to place the DynaMo Plus, instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Flat pad and palm pad.', 'https://player.vimeo.com/video/742533864', 'vald', NULL, true, true, 'vald'),
('shoulder-flexion-supine-rom', 'Shoulder flexion ROM', 'Shoulder', 'RangeofMotion', 'Flexion', 'Supine', 'Supine', 'Bilateral', 'rom', 0, false, 'Patient position
Supine with the arm being tested at the patient''s side, elbow extended and forearm pronated.
Contact point
Held in patient''s hand.
Device orientation
Vertical, consistent with the position of the patient''s hand.
Position of examiner
Seated adjacent to the patient, on the same side as the arm being tested, in a position to instruct and demonstrate the movement.
Instruction
Flex your shoulder as far as you can, keeping the DynaMo as still as possible.
Attachments
None.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-internal-rotation-seated-elbow-90-degrees-90-degree-shoulder-abduction-rom', 'Shoulder internal rotation ROM', 'Shoulder', 'RangeofMotion', 'InternalRotation', 'SeatedElbow90Degrees90DegreeShoulderAbduction', 'Seated - Elbow 90 Degrees, 90 Degree Shoulder Abduction', 'Bilateral', 'rom', 0, false, 'Patient position
Seated at the edge of the bed with their shoulder and elbow at 90 degrees.
Contact point
Fixed superior to the wrist.
Device orientation
Horizontal, consistent with the position of the patient''s hand.
Position of examiner
Seated adjacent to the patient, on the same side as the arm being tested, in a position to instruct and demonstrate the movement.
Instruction
Rotate your arm inwards as far as you can, keeping the DynaMo Lite as still as possible.', 'https://player.vimeo.com/video/795102131', 'vald', NULL, false, true, 'vald'),
('shoulder-internal-rotation-seated-45-degrees-shoulder-abduction-long-lever', 'Shoulder internal rotation', 'Shoulder', 'Strength', 'InternalRotation', 'Seated45DegreesShoulderAbductionLongLever', 'Seated - 45 Degrees Shoulder Abduction (Long Lever)', 'Bilateral', 'force', 0, false, 'Patient Position
Seated, with the shoulder being tested abducted to 45 degrees and elbow flexed to 90 degrees, and elbow rested on a flat surface.
Contact Point
Anterior aspect of the forearm, just proximal to the wrist.
Device Orientation
Horizontal, with the palm pad supported by the assessor and the curved pad in contact with the patient.
Position of Examiner
Seated adjacent to the patient, on the same side as the arm being tested, supporting the DynaMo.
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Palm pad and Curved Pad', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-internal-rotation-supine-elbow-90-degrees-90-degree-shoulder-abduction-rom', 'Shoulder internal rotation ROM', 'Shoulder', 'RangeofMotion', 'InternalRotation', 'SupineElbow90Degrees90DegreeShoulderAbduction', 'Supine - Elbow 90 Degrees, 90 Degree Shoulder Abduction', 'Bilateral', 'rom', 0, false, 'Patient Position
Supine with the shoulder being tested abducted to 90 degrees and elbow flexed to 90 degrees.
Contact Point
Held in the patient''s hand.
Device Orientation
Held in the patient''s hand.
Position of Examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Rotate your arm inwards as far as you can, keeping the DynaMo as still as possible.
Attachments
No attachments.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-internal-rotation-prone-elbow-90-degrees-90-degree-shoulder-abduction-rom', 'Shoulder internal rotation ROM', 'Shoulder', 'RangeofMotion', 'InternalRotation', 'ProneElbow90Degrees90DegreeShoulderAbduction', 'Prone - Elbow 90 Degrees, 90 Degree Shoulder Abduction', 'Bilateral', 'rom', 0, false, 'Patient Position
Prone with the shoulder being tested abducted to 90 degrees and elbow flexed to 90 degrees.
Contact Point
Held in the patient''s hand.
Device Orientation
Held in the patient''s hand.
Position of Examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Rotate your arm inwards as far as you can, keeping the DynaMo as still as possible.
Attachments
No attachments.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-internal-rotation-standing-elbow-90-degrees-rom', 'Shoulder internal rotation ROM', 'Shoulder', 'RangeofMotion', 'InternalRotation', 'StandingElbow90Degrees', 'Standing - Elbow 90 Degrees', 'Bilateral', 'rom', 0, false, 'Patient Position
Standing with elbow flexed to 90 degrees.
Contact Point
Held in the patient''s hand.
Device Orientation
Held in the patient''s hand.
Position of Examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Rotate your arm inwards as far as you can, keeping the DynaMo as still as possible.
Attachments
No attachments.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-internal-rotation-standing-elbow-90-degrees-90-degree-shoulder-abduction-rom', 'Shoulder internal rotation ROM', 'Shoulder', 'RangeofMotion', 'InternalRotation', 'StandingElbow90Degrees90DegreeShoulderAbduction', 'Standing - Elbow 90 Degrees, 90 Degree Shoulder Abduction', 'Bilateral', 'rom', 0, false, 'Patient Position
Standing with the shoulder being tested abducted to 90 degrees and elbow flexed to 90 degrees.
Contact Point
Held in the patient''s hand.
Device Orientation
Held in the patient''s hand.
Position of Examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Rotate your arm inwards as far as you can, keeping the DynaMo as still as possible.
Attachments
No attachments.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-internal-rotation-supine-elbow-90-degrees-rom', 'Shoulder internal rotation ROM', 'Shoulder', 'RangeofMotion', 'InternalRotation', 'SupineElbow90Degrees', 'Supine - Elbow 90 Degrees', 'Bilateral', 'rom', 0, false, 'Patient Position
Supine with the shoulder being tested abducted to 90 degrees and elbow flexed to 90 degrees.
Contact Point
Held in the patient''s hand.
Device Orientation
Held in the patient''s hand.
Position of Examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Rotate your arm inwards as far as you can, keeping the DynaMo as still as possible.
Attachments
No attachments.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-internal-rotation-side-lying-rom', 'Shoulder internal rotation ROM', 'Shoulder', 'RangeofMotion', 'InternalRotation', 'SideLying', 'Side Lying', 'Bilateral', 'rom', 0, false, 'Patient position
Side lying on non-testing side with elbow flexed to 90 degrees.
Contact point
Held in patient''s hand.
Device orientation
Vertical, consistent with the position of the patient''s hand.
Position of examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Rotate your arm inwards as far as you can, keeping the DynaMo as still as possible.
Attachments
None.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-isoitest-standing-chestto-wall', 'Shoulder iso i test', 'Shoulder', 'Strength', 'ISOITest', 'StandingChesttoWall', 'Standing - Chest to Wall', 'Bilateral', 'force', 0, false, 'Patient Position
Standing facing the wall with the arm being tested abducted to 180 degrees with the forearm neutral and the contralateral arm relaxed at the patient''s side.
Contact Point
Anterior aspect of the forearm, just proximal to the wrist.
Device Orientation
Horizontal, with the curved pad in contact with the patient and the flat pad in contact with a fixed surface.
Position of Examiner
Standing adjacent to the patient in a position to instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Curved pad and Flat pad', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-isoytest-standing-chestto-wall', 'Shoulder iso y test', 'Shoulder', 'Strength', 'ISOYTest', 'StandingChesttoWall', 'Standing - Chest to Wall', 'Bilateral', 'force', 0, false, 'Patient Position
Standing facing the wall with the arm being tested abducted to 135 degrees with the forearm neutral and the contralateral arm relaxed at the patient''s side.
Contact Point
Anterior aspect of the forearm, just proximal to the wrist.
Device Orientation
Horizontal, with the curved pad in contact with the patient and the flat pad in contact with a fixed surface.
Position of Examiner
Standing adjacent to the patient in a position to instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Curved pad and Flat pad', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-isottest-standing-chestto-wall', 'Shoulder iso t test', 'Shoulder', 'Strength', 'ISOTTest', 'StandingChesttoWall', 'Standing - Chest to Wall', 'Bilateral', 'force', 0, false, 'Patient Position
Standing facing the wall with the arm being tested abducted to 90 degrees with the forearm neutral and the contralateral arm relaxed at the patient''s side.
Contact Point
Anterior aspect of the forearm, just proximal to the wrist.
Device Orientation
Horizontal, with the curved pad in contact with the patient and the flat pad in contact with a fixed surface.
Position of Examiner
Standing adjacent to the patient in a position to instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Curved pad and Flat pad', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-isoitest-standing-backto-wall', 'Shoulder iso i test', 'Shoulder', 'Strength', 'ISOITest', 'StandingBacktoWall', 'Standing - Back to Wall', 'Bilateral', 'force', 0, false, 'Patient Position
Standing with back to the wall with the arm being tested abducted to 180 degrees with the forearm neutral and the contralateral arm relaxed at the patient''s side.
Contact Point
Posterior aspect of the forearm, just proximal to the wrist.
Device Orientation
Horizontal, with the curved pad in contact with the patient and the flat pad in contact with a fixed surface.
Position of Examiner
Standing adjacent to the patient in a position to instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Curved pad and Flat pad', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-isoytest-standing-backto-wall', 'Shoulder iso y test', 'Shoulder', 'Strength', 'ISOYTest', 'StandingBacktoWall', 'Standing - Back to Wall', 'Bilateral', 'force', 0, false, 'Patient Position
Standing with back to the wall with the arm being tested abducted to 135 degrees with the forearm neutral and the contralateral arm relaxed at the patient''s side.
Contact Point
Posterior aspect of the forearm, just proximal to the wrist.
Device Orientation
Horizontal, with the curved pad in contact with the patient and the flat pad in contact with a fixed surface.
Position of Examiner
Standing adjacent to the patient in a position to instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Curved pad and Flat pad', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-isottest-standing-backto-wall', 'Shoulder iso t test', 'Shoulder', 'Strength', 'ISOTTest', 'StandingBacktoWall', 'Standing - Back to Wall', 'Bilateral', 'force', 0, false, 'Patient Position
Standing with back to the wall with the arm being tested abducted to 90 degrees with the forearm neutral and the contralateral arm relaxed at the patient''s side.
Contact Point
Posterior aspect of the forearm, just proximal to the wrist.
Device Orientation
Horizontal, with the curved pad in contact with the patient and the flat pad in contact with a fixed surface.
Position of Examiner
Standing adjacent to the patient in a position to instruct and demonstrate the movement.
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Curved pad and Flat pad', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-push-standing', 'Shoulder push', 'Shoulder', 'Strength', 'Push', 'Standing', 'Standing', 'Bilateral', 'force', 0, false, 'Patient position
Custom setup.
Contact point
Palm of the hand.
Device orientation
Custom setup.
Position of examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, Flat pad.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-pull-standing', 'Shoulder pull', 'Shoulder', 'Strength', 'Pull', 'Standing', 'Standing', 'Bilateral', 'force', 0, false, 'Patient position
Custom setup.
Contact point
Gripping the hand attachment.
Device orientation
Custom setup.
Position of examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Pull against the DynaMo as hard as you can. 3, 2, 1 - pull, pull, pull and relax.
Attachments
Tension links, Carabiners, Tension strap, Hand attachment.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-pull-down-seated', 'Shoulder pull down', 'Shoulder', 'Strength', 'PullDown', 'Seated', 'Seated', 'Bilateral', 'force', 0, false, 'Patient Position
Custom setup.
Contact Point
Gripping the hand attachment.
Device Orientation
Custom setup.
Position of Examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Pull against the DynaMo as hard as you can 3, 2, 1 - pull, pull, pull and relax
Attachments
Tension Strap and Hand Attachment', 'https://player.vimeo.com/video/999140411', 'vald', NULL, false, true, 'vald'),
('shoulder-row-standing', 'Shoulder row', 'Shoulder', 'Strength', 'Row', 'Standing', 'Standing', 'Bilateral', 'force', 0, false, 'Patient position
Custom setup.
Contact point
Gripping the hand attachment.
Device orientation
Custom setup.
Position of examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Pull against the DynaMo as hard as you can. 3, 2, 1 - pull, pull, pull and relax.
Attachments
Tension links, Carabiners, Tension strap, Hand attachment.', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-row-seated', 'Shoulder row', 'Shoulder', 'Strength', 'Row', 'Seated', 'Seated', 'Bilateral', 'force', 0, false, 'Patient Position
Custom setup.
Contact Point
Gripping the hand attachment.
Device Orientation
Custom setup.
Position of Examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Pull against the DynaMo as hard as you can 3, 2, 1 - pull, pull, pull and relax
Attachments
Tension Strap and Hand Attachment', 'https://player.vimeo.com/video/999140476', 'vald', NULL, false, true, 'vald'),
('shoulder-row-prone', 'Shoulder row', 'Shoulder', 'Strength', 'Row', 'Prone', 'Prone', 'Bilateral', 'force', 0, false, 'Patient Position
Custom setup.
Contact Point
Gripping the hand attachment.
Device Orientation
Custom setup.
Position of Examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Pull against the DynaMo as hard as you can 3, 2, 1 - pull, pull, pull and relax
Attachments
Tension Strap', 'https://player.vimeo.com/video/999140441', 'vald', NULL, false, true, 'vald'),
('trunk-extension-prone', 'Trunk extension', 'Trunk', 'Strength', 'Extension', 'Prone', 'Prone', 'None', 'force', 0, false, 'Patient position
Prone on a flat surface.
Contact point
Interscapular region.
Device orientation
Vertical, with the palm pad supported by the practitioner and the curved pad in contact with the patient.
Position of examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Curved pad, Palm pad.', NULL, NULL, NULL, false, true, 'vald'),
('trunk-rotation-seated', 'Trunk rotation', 'Trunk', 'Strength', 'Rotation', 'Seated', 'Seated', 'Bilateral', 'force', 0, false, 'Patient Position
Patient seated in a neutral position with arms extended and elbows flexed, securing a dowel against their mid-back.
Contact Point
End of the dowel corresponding to the side/direction being tested.
Device Orientation
Horizontal, attached to the a fixed object at one end and the dowel at the other.
Position of Examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Pull against the DynaMo as hard as you can 3, 2, 1 - pull, pull, pull and relax
Attachments
Tension Strap', NULL, NULL, NULL, false, true, 'vald'),
('trunk-rotation-standing', 'Trunk rotation', 'Trunk', 'Strength', 'Rotation', 'Standing', 'Standing', 'Bilateral', 'force', 0, false, 'Patient Position
Patient seated in a neutral position with arms extended and elbows flexed, securing a dowel against their mid-back.
Contact Point
End of the dowel corresponding to the side/direction being tested
Device Orientation
Horizontal, attached to the a fixed object at one end and the dowel at the other.
Position of Examiner
Adjacent to the patient, in a position to situate the DynaMo and instruct the action.
Instruction
Pull against the DynaMo as hard as you can 3, 2, 1 - pull, pull, pull and relax
Attachments
Tension Strap', NULL, NULL, NULL, false, true, 'vald'),
('shoulder-abduction-seated-45-degrees-shoulder-abduction-long-lever', 'Shoulder abduction', 'Shoulder', 'Strength', 'Abduction', 'Seated45DegreesShoulderAbductionLongLever', 'Seated - 45 Degrees Shoulder Abduction (Long Lever)', 'Bilateral', 'force', 0, false, 'Patient position
Seated with feet on the floor, their arm straight and abducted to 45 degrees, and their forearm in a neutral position.
Contact point
Just proximal to the wrist.
Device orientation
Horizontal, with the palm pad supported by the practitioner, and the curved pad in contact with the patient.
Position of examiner
Adjacent to the patient, in a position to support and apply downward pressure to the DynaMo with both hands.
Instruction
Push against the pad as hard as you can. 3, 2, 1 - push, push, push and relax.
Attachments
Palm pad, Curved pad.', NULL, NULL, NULL, false, true, 'vald'),
('hip-internal-rotation-seated-rom', 'Hip internal rotation ROM', 'Hip', 'RangeofMotion', 'InternalRotation', 'Seated', 'Seated', 'Bilateral', 'rom', 0, false, 'Patient position
Sitting with their lower leg extending past the bed, allowing the ankle to be unsupported.
Contact point
Fixated to the lateral aspect of the patient''s lower leg.
Device orientation
Vertical, consistent with the position of the patient''s leg.
Position of examiner
Seated adjacent to patient, in a position to assess movement quality.
Instruction
Rotate your hip as far as you can, keeping the DynaMo Lite as still as possible.', 'https://player.vimeo.com/video/795102763', 'vald', NULL, true, true, 'vald'),
('hip-external-rotation-seated-rom', 'Hip external rotation ROM', 'Hip', 'RangeofMotion', 'ExternalRotation', 'Seated', 'Seated', 'Bilateral', 'rom', 0, false, 'Patient position
Seated at the edge of the bed with their hips and knees both at 90 degrees flexion, and hips abducted to allow for uninterrupted movement of the leg being assessed.
Contact point
Fixated along the lateral aspect of the patient''s lower leg.
Device orientation
Vertical, consistent with the position of the patient''s leg.
Position of examiner
Seated or kneeling in front of the patient, in a position to instruct and demonstrate the movement.
Instruction
Rotate your hip as far as you can, keeping the DynaMo Lite as still as possible.', 'https://player.vimeo.com/video/795102300', 'vald', NULL, false, true, 'vald'),
('hip-adduction-supine-knees-90-degrees', 'Hip adduction', 'Hip', 'Strength', 'Adduction', 'SupineKnees90Degrees', 'Supine - Knees 90 Degrees', 'Bilateral', 'force', 0, false, 'Patient Position
Supine on the table with the leg being tested at 90 degrees of knee flexion in a hook-lying position and the opposite leg fully extended.
Contact Point
Medial aspect of the patient''s knee.
Device Orientation
Horizontal, with the palm pad supported by the assessor and the curved pad in contact with the patient
Position of Examiner
Standing besides the table, opposite the side being tested, with one hand supporting the DynaMo and the other supporting the patient''s hip of their leg being tested.
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Palm pad and Curved Pad', NULL, NULL, NULL, false, true, 'vald'),
('hip-adduction-squeeze-supine-knees-90-degrees', 'Hip adduction squeeze', 'Hip', 'Strength', 'AdductionSqueeze', 'SupineKnees90Degrees', 'Supine - Knees 90 Degrees', 'Bilateral', 'force', 0, false, 'Patient Position
Supine with both legs in a hook-lying position and knees flexed to 90 degrees.
Contact Point
Medial aspect of both knees.
Device Orientation
Horizontal, with the palm pad supported by the assessor and the curved pad in contact with the patient
Position of Examiner
Standing or seated next to table, to place the DynaMo in position.
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Curved pad and Flat pad', NULL, NULL, NULL, false, true, 'vald'),
('hip-abduction-supine-knees-90-degrees', 'Hip abduction', 'Hip', 'Strength', 'Abduction', 'SupineKnees90Degrees', 'Supine - Knees 90 Degrees', 'Bilateral', 'force', 0, false, 'Patient Position
Supine on the table with the leg being tested at 90 degrees of knee flexion in a hook-lying position and the opposite leg fully extended.
Contact Point
Lateral aspect of the patient''s knee.
Device Orientation
Horizontal, with the palm pad supported by the assessor and the curved pad in contact with the patient.
Position of Examiner
Standing adjacent to the bed on the side of the tested leg, supporting the DynaMo.
Instruction
Push against the pad as hard as you can. 3,2,1 - push, push, push and relax.
Attachments
Palm pad and Curved Pad', NULL, NULL, NULL, false, true, 'vald'),
('hip-adduction-abduction-supine-knees-90-degrees', 'Hip adduction / abduction', 'Hip', 'Strength', 'AdductionAbduction', 'SupineKnees90Degrees', 'Supine - Knees 90 Degrees', 'Bilateral', 'force', 0, false, NULL, NULL, NULL, NULL, false, false, 'vald')
ON CONFLICT ("key") DO NOTHING;
