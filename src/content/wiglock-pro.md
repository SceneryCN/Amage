只在用户上传真实假发产品照片，并要求虚拟模特摄影、假发试戴、产品图、修图、对色或假发商业视觉时使用。其他任务不要套用本技能。

# WigLock Pro — Wig Product Fidelity Skill

## Purpose

Generate realistic commercial images featuring the user's actual wig products while preserving their original appearance as faithfully as technically possible.

This skill is designed for wig manufacturers, wholesalers, exporters, and e-commerce teams that need virtual model photography without changing the product being sold.

The task is product-preserving image editing, not hairstyle redesign.

**Priority order:**

1. Product identity and fidelity.
2. Preservation of original product characteristics.
3. Natural model integration.
4. Photographic quality and visual aesthetics.

Never sacrifice product fidelity to improve visual beauty.

## Workflow

Follow these steps whenever this skill is activated.

### Step 1: Identify and classify input images

Determine the role of each uploaded image:

* `product_reference`: Real photographs of the wig being sold.
* `model_reference`: Images defining the desired model appearance or pose.
* `style_reference`: Images defining the background, lighting, composition, or photography style.
* `previous_generation`: Previously generated outputs that may be used for comparison but are not authoritative product references.

Treat the original real product photographs as the source of truth.

If multiple product photographs are provided, use all available views to understand the product's shape and details.

Never treat a generated image as a more authoritative product reference than the original photograph.

If the product reference is ambiguous, ask for additional images instead of inventing missing details.

### Step 2: Establish product invariants

Before generating or editing an image, identify the product attributes that must remain unchanged.

Record the following when visible:

* Base color and overall color family.
* Root color and root transition.
* Highlight colors, locations, widths, density, and distribution.
* Curl type, curl diameter, wave amplitude, frequency, and direction.
* Hair length, layers, ends, and overall silhouette.
* Hair density, volume, and crown height.
* Parting, bangs, and hairline geometry.
* Lace-front construction, lace material, and visible cap details.
* Strand texture, gloss, flyaways, and other distinctive characteristics.

These attributes are locked unless the user explicitly requests a product modification.

Do not invent measurements or color codes that cannot be reliably inferred from the reference photographs.

### Step 3: Lock the product color

Color preservation is a critical requirement.

Preserve the original:

* Hue and undertone.
* Relative brightness and saturation.
* Dark roots and transition zones.
* Highlight colors and spatial distribution.
* Contrast between different strands and sections.
* Natural texture and gloss that affect perceived color.

Do not:

* Shift brown hair toward gray, silver, yellow, orange, red, or another color family.
* Turn beige or ash-blonde highlights into platinum or silver-white highlights.
* Lighten dark roots or remove natural root shading.
* Add, remove, move, or redistribute highlights.
* Apply global recoloring or beauty filters to the wig.
* Use cinematic color grading that changes the perceived product color.
* Increase gloss or exposure to the point that the original color becomes misleading.

Use neutral white balance and soft, neutral lighting whenever possible.

Lighting-related changes must not be used as a justification for redesigning the underlying color pattern.

For strict color accuracy, recommend controlled lighting, calibrated color references, and post-generation comparison. Text prompts alone cannot guarantee exact color reproduction.

### Step 4: Lock the curl pattern and shape

Preserve the original curl and wave geometry.

Maintain:

* Curl type and tightness.
* Curl diameter and wave amplitude.
* Wave frequency and direction.
* Strand grouping and overlap.
* Natural asymmetry and irregularity.
* Original length, layers, and end shape.
* Original width, volume, density, and silhouette.

Do not straighten, tighten, loosen, regularize, or redesign the hair.

Do not transform loose waves into spiral curls, tight curls into loose waves, or any existing hairstyle into a different style.

Do not make the hair artificially symmetrical.

Do not add bangs, remove layers, extend the length, shorten the hair, or increase the density unless explicitly requested.

### Step 5: Preserve the hairline and construction

When visible in the reference image, preserve:

* Hairline contour and temples.
* Parting and crown structure.
* Lace-front shape and mesh.
* Cap edges and attachment details.
* Existing special features of the wig.

Do not invent a different hairline or remove visible product construction details.

For realistic try-on images, natural blending around the forehead and temples is allowed only to the extent necessary for integration. It must not misrepresent the product's actual construction.

If the product's lace or cap details are important to the requested image, keep them visible and faithful to the reference.

### Step 6: Choose a product-preserving editing method

Prefer image editing and reference-conditioned workflows over generating the entire image from text.

Use this order of preference:

1. Preserve the original wig pixels wherever practical.
2. Use masks or protected regions to prevent unnecessary changes to the wig.
3. Modify the model, clothing, background, and surrounding scene independently.
4. Use localized editing for the minimum area required to integrate the wig with the model.
5. Use layer compositing when generation models cannot preserve the product accurately.
6. Inspect the final image against the original product photographs.

If the available image-generation system supports reference images, masks, regional editing, or image conditioning, use the supported features where appropriate.

Do not assume these capabilities exist in every model. If the system cannot protect the product region, explain the limitation and select an alternative workflow.

### Step 7: Integrate the wig with the virtual model

The user may request changes to:

* Adult model appearance and skin tone.
* Facial features and expression.
* Head pose and body posture.
* Clothing, makeup, and accessories.
* Background, lighting, composition, and scene.
* Image aspect ratio and e-commerce layout.

These changes must not alter the locked product attributes.

Choose a model pose and head angle that are compatible with the actual wig shape.

Do not reshape the entire wig to fit an unsuitable head pose.

Maintain plausible anatomy, occlusion, gravity, strand interaction, and contact around the forehead, temples, ears, neck, and shoulders.

Avoid unnatural hair intersections, floating strands, pasted-on edges, or synthetic-looking texture.

### Step 8: Apply negative constraints

When the image-generation interface supports negative prompts, include the relevant constraints:

* No wig redesign.
* No color replacement.
* No altered root color.
* No added or missing highlights.
* No redistributed highlights.
* No altered curl pattern.
* No altered curl diameter or wave direction.
* No altered hair length.
* No altered hair density.
* No altered silhouette.
* No invented bangs or parting.
* No unauthorized hairline changes.
* No global repainting of the wig.
* No excessive gloss or artificial smoothing.
* No creative reinterpretation of product details.

If the interface does not support negative prompts, incorporate these constraints into the main image-editing instruction.

### Step 9: Validate the result

Compare the generated image directly with the original product photographs.

Check:

| Attribute        | Validation requirement                           |
| ---------------- | ------------------------------------------------ |
| Base color       | Same color family and undertone                  |
| Root color       | Same appearance and transition                   |
| Highlights       | Same visible colors and distribution             |
| Curl pattern     | Same curl type, geometry, and direction          |
| Length           | No unauthorized length changes                   |
| Layers           | Original cutting and end shape retained          |
| Density          | No obvious addition or removal of hair           |
| Silhouette       | Original overall outline preserved               |
| Hairline         | No unauthorized structural changes               |
| Product identity | No substitution with a similar but different wig |

If a critical attribute has visibly changed, do not approve the image for strict product-listing use.

Attempt localized correction if supported. Otherwise, recommend compositing with the original product asset or requesting human review.

Do not rely exclusively on the model's self-assessment. Use direct image comparison and, when available, automated image-analysis tools.

### Step 10: Handle uncertainty and failure

If a product attribute cannot be identified confidently:

1. Do not guess.
2. Request a clearer photograph or additional viewing angle when necessary.
3. Preserve the known product attributes.
4. Identify any unresolved details that require review.

If the model cannot preserve the product while completing the requested edit:

1. Stop unrestricted regeneration of the wig region.
2. Attempt masked editing or protected-region editing.
3. Recommend a compositing workflow if necessary.
4. Mark the result as requiring review if fidelity remains uncertain.

Never claim 100% product consistency solely because the prompt requests it.

## Output Requirements

Generate the requested commercial image according to the user's instructions while preserving the locked product attributes.

Unless explicitly requested otherwise, do not alter the wig itself.

When a text response accompanies image generation, keep it concise and disclose material limitations if exact product fidelity could not be verified.

Do not claim that color, geometry, or product identity has been verified unless an appropriate comparison has actually been performed.

## Final Principles

The real product photograph is the authoritative reference.

The wig is the product, not a creative suggestion.

Preserve the product first and adapt the scene around it.

Do not invent missing details.

Do not sacrifice product identity for visual beauty.

If fidelity cannot be maintained, use product-preserving compositing or request human review.
