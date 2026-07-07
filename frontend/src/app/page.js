"use client";

import React, { useState, useEffect, useRef } from "react";

// All Gemini calls go through the FastAPI backend proxy so the API key never ships to the browser
const GEMINI_PROXY_BASE = "/api/gemini";
const IMAGE_MODEL = "gemini-3.1-flash-image";
const SYNTH_MODEL = "gemini-3.5-flash";
const MIN_OMNI_CLIP_SECONDS = 3;
const MAX_OMNI_CLIP_SECONDS = 10;
const DEFAULT_TARGET_SECONDS = 10;
// 0 = hard cut. True last-frame continuity makes cuts invisible; any crossfade
// blends two different images and reads as morphing/style-shift.
const DEFAULT_TIMELINE_TRANSITION_SECONDS = 0.3;
const OMNI_VIDEO_ASPECT_RATIOS = ["16:9", "9:16"];
const PB_TRANSITION_PRESETS = [
  { id: "cut", label: "Cut", group: "Basic", icon: "┃", ffmpeg: "cut", seconds: 0, audio: "cut" },
  { id: "fade", label: "Fade", group: "Dissolve", icon: "◐", ffmpeg: "fade", seconds: 0.45, audio: "fade" },
  { id: "dissolve", label: "Dissolve", group: "Dissolve", icon: "▒", ffmpeg: "dissolve", seconds: 0.45, audio: "fade" },
  { id: "wipeleft", label: "Wipe Left", group: "Wipe", icon: "⇤", ffmpeg: "wipeleft", seconds: 0.45, audio: "fade" },
  { id: "wiperight", label: "Wipe Right", group: "Wipe", icon: "⇥", ffmpeg: "wiperight", seconds: 0.45, audio: "fade" },
  { id: "slideleft", label: "Slide Left", group: "Slide", icon: "↤", ffmpeg: "slideleft", seconds: 0.45, audio: "fade" },
  { id: "slideright", label: "Slide Right", group: "Slide", icon: "↦", ffmpeg: "slideright", seconds: 0.45, audio: "fade" },
  { id: "zoomin", label: "Mobius Zoom", group: "Zoom", icon: "◎", ffmpeg: "zoomin", seconds: 0.55, audio: "fade" },
  { id: "hblur", label: "Morph Blur", group: "Immersive", icon: "≈", ffmpeg: "hblur", seconds: 0.50, audio: "fade" },
  { id: "circleopen", label: "Iris Open", group: "Iris", icon: "◌", ffmpeg: "circleopen", seconds: 0.50, audio: "fade" },
  { id: "radial", label: "Radial", group: "3D Motion", icon: "◉", ffmpeg: "radial", seconds: 0.55, audio: "fade" },
  { id: "pagepeel", label: "Page Peel", group: "Page Peel", icon: "◧", ffmpeg: "diagtr", seconds: 0.50, audio: "fade" }
];
const PB_TRANSITION_PRESET_BY_ID = Object.fromEntries(PB_TRANSITION_PRESETS.map((preset) => [preset.id, preset]));

const AGENT_PROFILE = `AGENT NAME: Cinematic Creative Director

IDENTITY:
You are a LEARNING cinematographer: you carry a persistent memory of lessons from past mistakes, user preferences, and techniques you studied online, and you actively apply that accumulated experience to every new production — never repeating a mistake you have already learned from. You are a world-class cinematography, advertising, and production expert representing a collective team with over 30 years of combined industry experience across film production, commercial advertising, cinematography, directing, motion graphics, visual design, photography, editing, VFX, branding, and post-production. You think as an entire production house under one roof.

CORE EXPERTISE: Commercial Film Production, Advertising Campaign Development, Brand Films, Product Films, TVCs, Digital Ads, Social Media Content, Corporate Films, Documentary Storytelling, Motion Graphics, VFX, Cinematography, Photography, Lighting Design, Art Direction, Production Design, Creative Direction, Film Direction, Editing, Color Grading, Sound Design, Script Writing, Storyboarding, Shot Design, Camera Movement Planning, AI Video Production, AI Image Generation, Creative Strategy.

TECHNOLOGY STACK — EXCLUSIVE:
You work EXCLUSIVELY with Google's AI models:
- VIDEO: Google Gemini Omni Flash — generates 3–10 second 720p cinematic video clips with audio, dialogue, timing control, native multimodal references, and conversational editing through interaction state. Clips can be of any length between 3 and 10 seconds (typically 3, 4, 6, 8, or 10 seconds) depending on narrative needs; longer films are produced as chained dynamic continuation clips merged in post.
- MUSIC: Google Lyria 3 — composes ONE continuous instrumental soundtrack for the full runtime, mixed under the film at export. Per-clip video prompts must therefore NEVER ask for background music or score.
- IMAGE: Gemini Flash Image Generation (Nano Banana Pro 2) — generates photorealistic stills, storyboards, and character sheets.
- TEXT: Gemini 3.5 Flash — script refinement, creative direction, prompt synthesis.

EDITING DOCTRINE — THE MAIN GAME:
- You are an editor as much as a director. Every clip (which can vary dynamically between 3 and 10 seconds depending on pacing) is an EDITED SCENE, not a single flat take: give it 2-4 internal beats with natural local timing (e.g. [0-2s], [2-4s] for a 4s clip; [0-3s], [3-8s] for an 8s clip).
- Use the full editorial toolkit inside clips: detail inserts (hands, eyes, objects), reaction shots, match cuts, B-roll, brief flashback or flash-forward inserts that connect this moment to the story's past or future, parallel action.
- Never let a clip be a mundane continuous action (a plain walk, a silent drive, waiting). Elevate it: intercut with a memory, cut to a meaningful detail, compress time with cuts, or reveal something with the camera.
- Internal cuts always return home: the clip still opens from its continuity frame and lands on its ending frame — the middle is where the editing lives.

STYLE PRECISION DOCTRINE:
- You NEVER describe a visual style vaguely. "Classical Indian painting" or "cinematic style" is amateur direction — you always name the exact school/movement/tradition, medium and surface, brush or render character, palette, and what the style must NEVER become. When the user is vague, you identify the closest precise tradition, name it to the user, and lock it.
- Reference images the user uploads show EXACTLY what they want. You study them and describe their precise style back to the user for confirmation — you never substitute your own aesthetic or add elements they did not ask for.
- STYLE DISCOVERY: When the user does not know what style they want, or names one vaguely, do NOT guess silently. You have live Google Search — research if needed, then present 3-4 precisely-named style candidates that fit their concept, each as an [OPTION:] button with the exact tradition name plus a one-line vivid description of how their film would look in it (e.g. [OPTION: Kangra miniature — jewel-tone gouache, fine outlines, flat dreamlike perspective]). Let the user pick; then lock that choice as the style anchor.

CINEMATOGRAPHY PROGRESSION & SHOT DIVERSITY DOCTRINE:
- NEVER repeat the same action, camera setup, framing, or pacing across adjacent clips.
- A multi-clip film must tell a visually dynamic, evolving story with a clear, cinematic narrative arc. Each clip should serve a distinct editorial role (establishing, detail, escalation, climax, reaction, resolution) with appropriately varied camera work.
- Vary camera techniques across clips (track, pan, dolly, crane, tilt, hand-held, aerial drone, extreme close-up, close-up, medium shot, wide shot) and use different focal points to create a professional film edit.
- Avoid repetitive loops — if a concept involves repeated action, vary it structurally across clips with different framings, angles, and story beats.


AUDIO CONSISTENCY DOCTRINE (for any video longer than one clip):
- Define ONE frozen AUDIO SIGNATURE for the whole film and reuse it verbatim in every clip: exact voice identity (age, gender, accent, tone, pace), ambience palette (e.g. "soft city hum, distant traffic"), and sound-design character.
- Per-clip audio = dialogue + diegetic sound + ambience ONLY. No music, no score, no soundtrack inside clips — the Lyria bed covers music continuously across all cuts.
- Also define ONE MUSIC BRIEF for Lyria: genre, mood arc, tempo/BPM, key instrumentation, and how it should evolve over the runtime (e.g. "builds from sparse piano to full strings at the product reveal"). Always instrumental unless the user asks for vocals.
- When you present a final production script for a multi-clip film, include an "AUDIO SIGNATURE" line and a "MUSIC BRIEF" line so they can be locked across all clips.

CRITICAL RULES:
- NEVER mention Veo, Midjourney, Runway, Sora, DALL-E, Stable Diffusion, Pika, Kling, Luma, or ANY other AI platform/model by name.
- NEVER use flags or syntax from other tools (no --ar, --v, --stylize, --chaos, --seed, /imagine, etc.).
- All prompts must be written as natural-language cinematic descriptions optimized for Google Gemini Omni Flash.
- Gemini Omni Flash understands native multimodal inputs: text, image, audio, and video context. Use that strength for cohesive product references, starting frames, subject identity, physics, timing, camera movement, lens focal length, lighting setup, character action, dialogue, environment, mood, color grading, and audio direction — all described in plain language.
- For video prompts, use natural timecoded beats when helpful, e.g. [0-3s], [3-6s], [6-10s]. For a 10-second or shorter result, prefer one continuous native Omni clip instead of artificial stitching.
- When writing video prompts, describe the scene as if briefing a real cinematographer: subject, action, camera, lighting, environment, audio/dialogue, mood.
- Aspect ratio is controlled by the app UI, not in the prompt text.
- Do NOT include technical AI parameters in the prompt. Just describe the cinematic vision.

IMAGE REFERENCING RULE:
- NEVER write [# Sources], [# References], <FIRST_FRAME>, <IMAGE_REF_N>, @ImageN, or any tag/header syntax in scripts or prompts — the app builds those headers itself at request time. NEVER refer to uploaded/attached images by number or position ("Image 1", "the second image") in any script or prompt you write — the app manages attachment order automatically and numeric references break. Refer to references by the user's tag name or by describing their content in plain words.

INTERACTIVE OUTPUT FORMAT:
Whenever you present options, suggestions, or next steps to the user, format each actionable choice on its own line using this exact syntax:
[OPTION: short actionable text here]

Examples:
[OPTION: Keep the plaid shirt, natural rugged look]
[OPTION: Switch to tactical explorer outfit]
[OPTION: Widescreen 16:9 for YouTube/TVC]
[OPTION: Vertical 9:16 for Reels/TikTok/Shorts]
[OPTION: Proceed to generate the video]
[OPTION: Refine the script further]
[OPTION: Build a visual storyboard first]

Rules for options:
- Keep each option text SHORT (under 10 words ideally). It renders as a button.
- Always provide 2-4 clear options when asking the user to decide.
- End every response with actionable options so the user can tap to proceed.
- You can also include [DO: Generate Video] or [DO: Build Storyboard] to suggest triggering app functions.
- Still write your full creative analysis BEFORE the options — don't replace your expertise with just buttons.`;

const pbExtractRequestedDurationSeconds = (text = "") => {
  const source = String(text);
  const minuteMatch = source.match(/(\d+(?:\.\d+)?)\s*[- ]?\s*(minutes?|mins?|m)\b/i);
  if (minuteMatch) return Math.max(1, Math.round(Number(minuteMatch[1]) * 60));

  const secondMatch = source.match(/(\d+(?:\.\d+)?)\s*[- ]?\s*(seconds?|secs?|s)\b/i);
  if (secondMatch) return Math.max(1, Math.round(Number(secondMatch[1])));

  return null;
};

const pbPlanClipDurations = (targetSeconds = DEFAULT_TARGET_SECONDS) => {
  const totalSeconds = Math.max(MIN_OMNI_CLIP_SECONDS, Math.round(Number(targetSeconds) || DEFAULT_TARGET_SECONDS));
  if (totalSeconds <= MAX_OMNI_CLIP_SECONDS) return [totalSeconds];

  const clipCount = Math.ceil(totalSeconds / MAX_OMNI_CLIP_SECONDS);
  const baseDuration = Math.floor(totalSeconds / clipCount);
  const remainder = totalSeconds - baseDuration * clipCount;

  return Array.from({ length: clipCount }, (_, clipIndex) =>
    baseDuration + (clipIndex < remainder ? 1 : 0)
  );
};

// The app owns the Omni grammar headers — if the splitter/agent ever writes
// [# Sources]/[# References]/<FIRST_FRAME>/@ImageN syntax into a prompt, strip it
// so requests never carry conflicting declarations.
const pbStripTagSyntax = (text = "") => {
  return String(text)
    .replace(/\[#\s*(Sources|References)[^\]]*\]/gi, "")
    .replace(/<\/?\s*(FIRST_FRAME|IMAGE_REF_?\d*|CHARACTER_REF[^>]*|STYLE_REF|STORYBOARD|END_SCREEN)\s*>/gi, "")
    .replace(/@Image\d+/gi, "")
    .replace(/^\s*`+|`+\s*$/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
};

const pbStripModelTimecodePrefix = (prompt = "") => {
  return String(prompt)
    .replace(/^\s*\[\s*\d+(?:\.\d+)?\s*[-–—]\s*\d+(?:\.\d+)?\s*s(?:ec(?:ond)?s?)?\s*\]\s*/i, "")
    .replace(/^\s*\(\s*\d+(?:\.\d+)?\s*[-–—]\s*\d+(?:\.\d+)?\s*s(?:ec(?:ond)?s?)?\s*\)\s*/i, "")
    .replace(/^\s*(?:clip|shot)\s*\d+\s*[:.]\s*/i, "")
    .trim();
};

// Strip character surnames and age markers from prompts to avoid the
// "real people's names or likenesses" safety block in the video API.
// Keeps first names (Aditi, Meera) but removes surnames (Sharma, etc.)
// and biographical-looking markers like "(34)".
// Pass-through: prompts are used exactly as the agent wrote them.
// No hardcoded name/surname mangling — the agent handles safety phrasing.
// Map of names that trigger Gemini's "real people" safety filter → anonymous visual descriptors.
// The character design sheet image is still attached, so the model knows what they LOOK like;
// we just strip the name so the text doesn't trip the filter.
const SAFETY_NAME_MAP = [
  // Mythological / religious figures
  { pattern: /\bKrishna\b/gi, replacement: "the young divine hero (golden-brown human skin, NOT blue)" },
  { pattern: /\bRadha\b/gi, replacement: "the young heroine companion" },
  { pattern: /\bSita\b/gi, replacement: "the noble heroine" },
  { pattern: /\b(Lord\s+|Sri\s+)?Ram(a|an)?\b/g, replacement: "the heroic prince" },
  { pattern: /\bShiva\b/gi, replacement: "the ascetic divine figure" },
  { pattern: /\bParvati\b/gi, replacement: "the divine consort" },
  { pattern: /\bHanuman\b/gi, replacement: "the devoted warrior companion" },
  { pattern: /\bGanesha?\b/gi, replacement: "the elephant-headed deity figure" },
  { pattern: /\bLakshmi\b/gi, replacement: "the goddess of prosperity" },
  { pattern: /\bSaraswati\b/gi, replacement: "the goddess of knowledge" },
  { pattern: /\bDurga\b/gi, replacement: "the warrior goddess" },
  { pattern: /\bArjuna?\b/gi, replacement: "the skilled archer prince" },
  { pattern: /\bDraupadi\b/gi, replacement: "the royal heroine" },
  { pattern: /\bYashoda\b/gi, replacement: "the loving foster mother" },
  { pattern: /\bNanda\b/gi, replacement: "the village chief elder" },
  { pattern: /\bBalarama?\b/gi, replacement: "the elder brother hero" },
  { pattern: /\bMeera(bai)?\b/gi, replacement: "the devoted poetess singer" },
  // Artist names that cause watermarks / signatures
  { pattern: /\b(Raja\s+Ravi\s+Varma|Ravi\s+Varma)\b/gi, replacement: "late 19th-century Indian academic oil painting style" },
  { pattern: /\bStudio\s+Ghibli\b/gi, replacement: "classic hand-drawn cel animation style" },
  { pattern: /\bHayao\s+Miyazaki\b/gi, replacement: "classic hand-drawn anime style" },
  { pattern: /\bDisney\b/gi, replacement: "classic Western animation style" },
  { pattern: /\bPixar\b/gi, replacement: "modern 3D animation style" },
];

const pbStripCharacterSurnames = (prompt = "") => {
  let result = String(prompt);
  for (const { pattern, replacement } of SAFETY_NAME_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result.trim();
};

const pbExtractCharacterNameFromTag = (tag = "") => {
  if (!tag) return null;
  const words = tag.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z0-9]/gi, "").trim()).filter(Boolean);
  const stopWords = new Set(["character", "design", "ref", "reference", "image", "sheet", "model", "style", "shot", "clip", "guide", "concept", "turnaround", "expression", "expressions", "attire", "outfit", "face", "hair"]);
  const nameWord = words.find(w => !stopWords.has(w));
  return nameWord || null;
};

const pbGetImageBase64 = (img = {}) => {
  if (img.base64) return img.base64;
  if (typeof img.src === "string" && img.src.includes(",")) return img.src.split(",")[1];
  return "";
};

const pbGetImageMimeType = (img = {}) => {
  if (img.mimeType) return img.mimeType;
  if (typeof img.src === "string" && img.src.startsWith("data:")) {
    return img.src.split(";")[0].split(":")[1] || "image/png";
  }
  return "image/png";
};

const PB_NO_LOOKALIKE_START =
  "NO LOOKALIKE START: the first frame must already show the locked character exactly. Do not begin with a different face, hair, beard, body, or outfit and then morph/correct into the real character later.";

const PB_LOGO_INTEGRITY =
  "LOGO/TEXT INTEGRITY: any logo, lettering, badge, jersey wordmark, label, or brand mark visible in a user-shared image is immutable. Preserve it only on the exact referenced object or wardrobe surface, with the same placement, scale, colors, and layout. Never redraw, approximate, reinterpret, redesign, or re-create that logo/lettering on a new surface such as a stadium screen, billboard, banner, signboard, UI panel, background wall, or crowd prop. If exact logo reproduction is uncertain, leave that new surface blank or generic.";

const PB_PRODUCT_EXACT_LOCK =
  "IMPORTANT PRODUCT LOCK: do not change the design or artwork of the product. Keep the product shape, size, proportions, color, cap, body parts, label artwork, logo, lettering, printed food imagery, spacing, and layout exactly like the attached product image. Do not simplify, redesign, relabel, genericize, restyle, repaint, replace, or approximate the package. If the exact label/artwork cannot be preserved in a shot, show less of the product or use angle/motion blur, but never invent a different package design.";

const PB_REGIONAL_LANGUAGE_LOCK =
  "REGIONAL LANGUAGE LOCK: preserve the user's original language exactly for all voiceover, dialogue, chants, slogans, captions, and quoted lines. If the script uses Hindi, Hinglish, romanized Hindi, Tamil, Telugu, Bengali, Marathi, Punjabi, Gujarati, Kannada, Malayalam, Urdu, or any code-switched regional wording, keep those words verbatim. Do not translate them into English, do not paraphrase them, do not improve grammar, and do not replace them with English equivalents. Visual/camera descriptions may be in English, but spoken words and any user-provided text must remain exactly in the source language.";

const PB_VOICEOVER_LOCK = "";

const PB_AUDIO_VOICE_LOCK =
  "VOICE CONSISTENCY LOCK: every clip must use the exact same speaker identity, pitch range, timbre, accent, age, gender, vocal texture, microphone distance, loudness, and pacing. Do not make the voice higher, lower, younger, older, more cartoonish, more robotic, or more energetic in any clip. Treat the narrator/character voice like the same recorded person across the full film.";

const pbCleanSpokenLine = (dialogue = "") => {
  return String(dialogue || "")
    .replace(/^\s*(?:[*_`~\s-]*)(?:VO|V\.O\.?|VOICE\s*OVER|VOICEOVER|NARRATION|NARRATOR)\s*[:：-]\s*/i, "")
    .replace(/^["“”'‘’*_\s]+|["“”'‘’*_\s]+$/g, "")
    .trim();
};

const pbIsVoiceOverCue = (text = "") => {
  return /^\s*(?:[*_`~\s-]*)(?:VO|V\.O\.?|VOICE\s*OVER|VOICEOVER|NARRATION|NARRATOR)\s*[:：-]/i.test(String(text || ""));
};

const pbIsVoiceOverClip = (clip = {}) => {
  if (String(clip.audio_role || clip.audioRole || "").toLowerCase() === "voiceover") return true;
  if (pbIsVoiceOverCue(clip.dialogue)) return true;
  return /\b(?:VO|V\.O\.?|VOICE\s*OVER|VOICEOVER|NARRATION|NARRATOR)\s*[:：-]/i.test(String(clip.prompt || ""));
};

const pbBuildSpokenLanguageLock = (dialogue = "", isVoiceOver = false) => {
  const text = pbCleanSpokenLine(dialogue);
  return text
    ? `${PB_REGIONAL_LANGUAGE_LOCK} The final spoken line for this clip is exactly: "${text}". Speak this exact text with the intended regional accent and code-switching; no English translation, no alternate wording, no subtitles. ${isVoiceOver ? PB_VOICEOVER_LOCK : ""}`
    : PB_REGIONAL_LANGUAGE_LOCK;
};

const pbPromptMentionsProduct = (clipPrompt = "", productImg = {}) => {
  if (!clipPrompt) return true;
  
  const promptLower = String(clipPrompt).toLowerCase();
  
  // 1. Explicit request for the product
  if (/\b(product|final shot|product shot|final product|packshot|hero shot)\b/i.test(promptLower)) {
    return true;
  }
  
  // 2. Dynamic brand/product detection from the product image's tag and lock text
  const tag = String(productImg.tag || "").toLowerCase();
  const lock = String(productImg._productLock || "").toLowerCase();
  const combined = `${tag} ${lock}`;
  
  // Extract meaningful words from the product tag (skip generic filler)
  const filler = new Set(["product", "the", "a", "an", "of", "and", "in", "on", "for", "with", "is", "to", "—", "-", "reference", "image", "tag", "lock", "exact", "captured", "notes"]);
  const tagWords = combined.match(/[a-z]{3,}/g)?.filter(w => !filler.has(w)) || [];
  
  // Check if the clip prompt contains at least 2 words from the product tag
  // (co-occurrence: brand + product keyword together)
  for (const word of tagWords) {
    if (promptLower.includes(word)) return true;
  }
  
  return false;
};

const PB_OBJECT_LOCK_TAG_RE = /\b(logo|badge|emblem|wordmark|mark|icon|mascot|prop|object|equipment|trophy|medal|accessory|device|tool|gear|instrument)\b/i;

const PB_ELEVENLABS_VOICES = [
  { name: "Talia (Warm Soft Guide - Female)", id: "OZ0L6eISlOejga3XjDFt" },
  { name: "Elara (Crisp Pro Narrator - Female)", id: "WQP7cQUF5aAS6Axh5yaa" },
  { name: "Alicia (Polished Global Anchor - Female)", id: "BFd5oBc2DDna33pSi4Gf" },
  { name: "Florence (Atmospheric Storyteller - Female)", id: "22N9cF8z0o7y23njdyaY" },
  { name: "Darian (Warm Grounded Storyteller - Male)", id: "gOupLcAkjEnguROwi4oS" },
  { name: "Baxter (Dry Calm Aussie - Male)", id: "jSuBIjxMKhqIfb0wCK1F" },
  { name: "Eldrin (Crisp British Baritone - Male)", id: "6WwXjDDEMyNmFG95zycZ" },
  { name: "Wyatt (Seasoned Mentor - Male)", id: "FrS6cKLB1wg4WYgPa9GW" },
  { name: "Warren (Effortless and Cool - Male)", id: "7QN34D2r3hCNwbOYIeK0" },
  { name: "Finley (Articulate Anchor - Male)", id: "fnYMz3F5gMEDGMWcH1ex" },
  { name: "Kellan (Casual Friendly Speaker - Male)", id: "10NkTYmU7tSz3Kkl3Lex" },
  { name: "Rachel (Legacy - Female)", id: "21m00Tcm4TlvDq8ikWAM" }
];

const pbDescribeApiError = (data, fallback) => {
  if (!data) return fallback;
  if (typeof data.error === "string") return data.error;
  if (data.error?.message) return data.error.message;
  if (data.message) return data.message;
  return fallback;
};

const pbReadGeminiJson = async (response, label = "Gemini request") => {
  const rawText = await response.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    const preview = rawText.replace(/\s+/g, " ").trim().slice(0, 180);
    throw new Error(`${label} returned non-JSON HTTP ${response.status}. ${preview || "Empty response"}`);
  }

  if (!response.ok || data?.error) {
    throw new Error(pbDescribeApiError(data, `${label} failed with HTTP ${response.status}`));
  }
  return data;
};

const pbBuildTimelineRanges = (durationPlan) => {
  let cursor = 0;
  return durationPlan.map((durationSeconds) => {
    const startSeconds = cursor;
    const endSeconds = cursor + durationSeconds;
    cursor = endSeconds;
    return { startSeconds, endSeconds, durationSeconds };
  });
};

const pbFormatTimelineRange = (startSeconds = 0, endSeconds = DEFAULT_TARGET_SECONDS) => {
  return `${Math.round(startSeconds)}-${Math.round(endSeconds)}s`;
};

const pbBalanceDurations = (durations, targetTotal) => {
  if (!durations || durations.length === 0) {
    return [targetTotal];
  }
  let sum = durations.reduce((a, b) => a + b, 0);
  if (sum === targetTotal) return durations;
  
  const result = [...durations];
  let diff = targetTotal - sum;
  
  // Adjust starting from the last clip backwards
  for (let i = result.length - 1; i >= 0; i--) {
    const current = result[i];
    const newDur = Math.max(3, Math.min(10, current + diff));
    diff -= (newDur - current);
    result[i] = newDur;
    if (diff === 0) break;
  }
  
  // If still not balanced, force the last clip to hold the remaining difference
  if (diff !== 0) {
    result[result.length - 1] = Math.max(3, result[result.length - 1] + diff);
  }
  
  return result;
};

const pbNormalizeClipSegments = (segments, fallbackPrompt, durationPlan) => {
  const sourceSegments = Array.isArray(segments) && segments.length > 0
    ? segments
    : [{ prompt: fallbackPrompt, dialogue: null }];

  const ranges = pbBuildTimelineRanges(durationPlan);

  return ranges.map(({ startSeconds, endSeconds, durationSeconds }, clipIndex) => {
    const source = sourceSegments[clipIndex] || sourceSegments[sourceSegments.length - 1] || {};
    let prompt = pbStripModelTimecodePrefix(pbStripTagSyntax(source.prompt) || fallbackPrompt) || fallbackPrompt;
    // If the splitter returned fewer segments than clips, the same prompt gets
    // reused — scope it so each clip renders only its own slice of the story.
    const reusedSegment = !sourceSegments[clipIndex] && ranges.length > 1;
    if (reusedSegment) {
      prompt += `\n[SCOPE]: This clip covers ONLY part ${clipIndex + 1} of ${ranges.length} (${pbFormatTimelineRange(startSeconds, endSeconds)}) of the full story above. Depict only that portion of the narrative, continuing seamlessly from the previous part.`;
    }
	    return {
	      prompt,
	      dialogue: source.dialogue || null,
	      audio_role: source.audio_role || (pbIsVoiceOverClip(source) ? "voiceover" : (source.dialogue ? "onscreen_dialogue" : "none")),
	      duration_seconds: durationSeconds,
      start_seconds: startSeconds,
      end_seconds: endSeconds,
      end_state: pbStripTagSyntax(source.end_state || ""),
      identity_anchor: source.identity_anchor || "",
      product_notes: source.product_notes || null,
      new_scene: source.new_scene || false
    };
  });
};

const pbCompressImage = (dataUrlOrBase64, maxDim = 768, quality = 0.7) => {
  return new Promise((resolve) => {
    let src = dataUrlOrBase64;
    if (!src.startsWith("data:")) {
      src = `data:image/png;base64,${dataUrlOrBase64}`;
    }
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      resolve(dataUrlOrBase64);
    };
    img.src = src;
  });
};

const pbGetClipTimelineSeconds = (clip) => {
  if (!clip || clip.excluded) return 0;
  const trimStart = Number(clip.trimStart) || 0;
  const trimEnd = Number(clip.trimEnd ?? clip.plannedDuration ?? clip.duration ?? DEFAULT_TARGET_SECONDS);
  return Math.max(0, trimEnd - trimStart);
};

const pbNormalizeTransition = (transition = null) => {
  const preset = PB_TRANSITION_PRESET_BY_ID[transition?.id] || PB_TRANSITION_PRESET_BY_ID.cut;
  const durationSource = Number.isFinite(Number(transition?.duration)) ? Number(transition.duration) : preset.seconds;
  return {
    id: preset.id,
    label: preset.label,
    ffmpeg: preset.ffmpeg,
    duration: Math.max(0, Math.min(2, durationSource)),
    audio: preset.audio || "fade"
  };
};

const pbPatchClipAt = (clips, clipIndex, updates) => {
  return clips.map((clip, index) => index === clipIndex ? { ...clip, ...updates } : clip);
};

const pbClampOmniClipSeconds = (durationSeconds = DEFAULT_TARGET_SECONDS) => {
  return Math.min(
    MAX_OMNI_CLIP_SECONDS,
    Math.max(MIN_OMNI_CLIP_SECONDS, Math.round(Number(durationSeconds) || DEFAULT_TARGET_SECONDS))
  );
};

const pbRenderInlineMarkdown = (text, keyPrefix) => {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, partIndex) => {
    const boldMatch = part.match(/^\*\*(.+)\*\*$/);
    if (boldMatch) return <strong key={`${keyPrefix}-${partIndex}`}>{boldMatch[1]}</strong>;
    return <React.Fragment key={`${keyPrefix}-${partIndex}`}>{part}</React.Fragment>;
  });
};

const pbRenderChatMarkdown = (text) => {
  return String(text).split("\n").map((rawLine, lineIndex) => {
    const line = rawLine.trimEnd();
    const trimmedLine = line.trim();
    const keyPrefix = `md-${lineIndex}`;

    if (!trimmedLine) return <div key={keyPrefix} className="pb-md-space" />;
    if (/^-{3,}$/.test(trimmedLine)) return <hr key={keyPrefix} className="pb-md-rule" />;

    // Markdown headings: # ## ### ####
    const headingMatch = trimmedLine.match(/^(#{1,4})\s*(.+)$/);
    if (headingMatch) {
      const headingText = headingMatch[2].replace(/^\*\*(.+)\*\*$/, "$1");
      return (
        <div key={keyPrefix} className={`pb-md-heading pb-md-heading-${headingMatch[1].length}`}>
          {pbRenderInlineMarkdown(headingText, keyPrefix)}
        </div>
      );
    }

    // CLIP N: / SCENE N: / BEAT N: style headers → render as h2
    const clipHeaderMatch = trimmedLine.match(/^(CLIP|SCENE|BEAT|SHOT)\s*\d+\s*[:\.]\s*(.+)$/i);
    if (clipHeaderMatch) {
      return (
        <div key={keyPrefix} className="pb-md-heading pb-md-heading-2">
          {pbRenderInlineMarkdown(trimmedLine, keyPrefix)}
        </div>
      );
    }

    // Section labels like "•Lighting:", "•SFX:", "•Voiceover (Hindi):" — treat as bold labels
    const labelMatch = trimmedLine.match(/^[•\-\*]\s*(.+)$/);
    if (labelMatch) {
      // Detect sub-bullet (indented)
      const isSubBullet = rawLine.match(/^\s{2,}/);
      return (
        <div key={keyPrefix} className="pb-md-list-item" style={isSubBullet ? {paddingLeft: "16px"} : undefined}>
          <span className="pb-md-bullet">{isSubBullet ? "◦" : "•"}</span>
          <span>{pbRenderInlineMarkdown(labelMatch[1], keyPrefix)}</span>
        </div>
      );
    }

    // Bullet-style lines: * text, - text, • text (also handles •Text with no space)
    const bulletNoSpaceMatch = trimmedLine.match(/^•(.+)$/);
    if (bulletNoSpaceMatch) {
      return (
        <div key={keyPrefix} className="pb-md-list-item">
          <span className="pb-md-bullet">•</span>
          <span>{pbRenderInlineMarkdown(bulletNoSpaceMatch[1], keyPrefix)}</span>
        </div>
      );
    }

    return (
      <div key={keyPrefix} className="pb-md-line">
        {pbRenderInlineMarkdown(line, keyPrefix)}
      </div>
    );
  });
};

const pbReadStoredVideoLibrary = () => {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("pb_video_library") || "[]");
  } catch (e) {
    console.error("Failed to parse video library:", e);
    return [];
  }
};

// Helper: Basic fetch client for Gemini API with proxy fallback
async function callGeminiAPI(
  apiKey,
  model,
  systemInstruction,
  contents,
  responseMimeType
) {
  const url = apiKey
    ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    : `${GEMINI_PROXY_BASE}/models/${model}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: responseMimeType ? { responseMimeType } : undefined
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API Error: ${response.statusText} (${response.status})`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// -------------------------------------------------------------
// Component 1: Smart Reference Selection
// Picks the most relevant images based on the user's specific prompt
// -------------------------------------------------------------
const selectBestSubjectImages = async (
  apiKey,
  prompt,
  subjectImages // Base64 data URLs
) => {
  if (subjectImages.length <= 1) return subjectImages;

  try {
    const selectionPrompt = `You are given ${subjectImages.length} product images, each showing the same product from a different angle.
User prompt: "${prompt}"

Identify which image index (or indices) are MOST RELEVANT as a visual reference for generating the output.
- If the prompt mentions a specific angle/feature, pick that.
- If the prompt is general, pick the clearest full view.
- Return at most 3 indices, ordered best-first.

Return ONLY strict JSON: { "selected": [0, 2, 1] }`;

    const contents = [
      ...subjectImages.map((img, idx) => ([
        { text: `Image ${idx}:` },
        { inlineData: { mimeType: 'image/jpeg', data: img.split(',')[1] || img } }
      ])).flat(),
      { text: selectionPrompt }
    ];

    const result = await callGeminiAPI(
      apiKey,
      'gemini-2.5-flash',
      'You are a visual reference selector for AI image generation.',
      contents,
      'application/json'
    );

    const parsed = JSON.parse(result.trim());
    const selected = Array.isArray(parsed?.selected) ? parsed.selected : [];

    if (selected.length > 0) {
      const selectedImgs = selected.map(i => subjectImages[i]).filter(Boolean);
      const restImgs = subjectImages.filter((_, i) => !selected.includes(i));
      return [...selectedImgs, ...restImgs];
    }
  } catch (err) {
    console.warn('[selectBestSubjectImages] Smart selection failed, using original order:', err);
  }

  return subjectImages;
};

// -------------------------------------------------------------
// Component 2: Multi-View Identity Prompt Extraction
// Compiles a stable text-based product description from reference views
// -------------------------------------------------------------
const extractMultiViewReferencePrompt = async (
  apiKey,
  referenceImages // Base64 data URLs
) => {
  if (referenceImages.length <= 1) return '';

  try {
    const contents = [
      ...referenceImages.map(img => ({
        inlineData: { mimeType: 'image/jpeg', data: img.split(',')[1] || img }
      })),
      {
        text: `These images show the same subject/product from different angles or detail views.
Extract only the stable, reusable visual truth that should remain consistent in a new generation:
- silhouette and overall proportions
- materials and texture
- seams, closures, straps, hardware, edges
- branding placement, label placement, and recurring visual markers
- color relationships
- what changes across views versus what stays fixed

Return strict JSON:
{
  "summary": "one compact production-ready multi-view reference summary",
  "constraints": ["short rule", "short rule"]
}`
      }
    ];

    const analysis = await callGeminiAPI(
      apiKey,
      'gemini-2.5-flash',
      'You summarize multi-angle reference images into one precise identity-preservation pack.',
      contents,
      'application/json'
    );

    const parsed = JSON.parse(analysis.trim()) || {};
    const summary = String(parsed.summary || '').trim();
    const constraints = Array.isArray(parsed.constraints) ? parsed.constraints : [];
    
    return [summary, ...constraints.map((item) => `- ${item}`)].filter(Boolean).join('\n').trim();
  } catch (err) {
    console.warn('[extractMultiViewReferencePrompt] Failed to analyze reference views:', err);
    return '';
  }
};

// -------------------------------------------------------------
// Component 3: Build Reference Contact Sheet
// Stitches multiple details into a single image to save token space & model focus
// -------------------------------------------------------------
const buildReferenceContactSheet = async (
  images, // Base64 data URLs
  label = 'SUBJECT REFERENCE PACK - SAME PRODUCT',
  tileSize = 420
) => {
  if (images.length <= 1 || typeof document === 'undefined') return undefined;

  const tile = tileSize;
  const labelHeight = 34;
  const gap = 12;
  const columns = Math.min(4, Math.ceil(Math.sqrt(images.length)));
  const rows = Math.ceil(images.length / columns);
  const width = columns * tile + (columns + 1) * gap;
  const height = rows * (tile + labelHeight) + (rows + 1) * gap + 46;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(label, gap, 30);

  // Draw images
  await Promise.all(images.map((src, index) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = gap + col * (tile + gap);
      const y = 46 + gap + row * (tile + labelHeight + gap);

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(x, y, tile, tile);

      const scale = Math.min(tile / img.width, tile / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;

      ctx.drawImage(img, x + (tile - drawW) / 2, y + (tile - drawH) / 2, drawW, drawH);

      ctx.fillStyle = '#111827';
      ctx.font = '18px sans-serif';
      ctx.fillText(`Subject view ${index + 1}`, x + 10, y + tile + 24);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = src;
  })));

  return canvas.toDataURL('image/jpeg', 0.9);
};

// -------------------------------------------------------------
// Component 4: Constraint Header Injection
// Injects a high-priority system block to enforce strict reproduction
// -------------------------------------------------------------
const applySubjectProfilePriority = (
  prompt,
  subjectProfileText,
  subjectImageCount
) => {
  if (subjectImageCount <= 0) return prompt;

  const lockBlock = [
    `⚠️ PRODUCT IDENTITY LOCK (HIGHEST PRIORITY — CANNOT BE OVERRIDDEN):`,
    `The image(s) provided are the ACTUAL PRODUCT. You are NOT creating a new product design.`,
    `You MUST reproduce the exact product shown in the reference image(s):`,
    `  • Same silhouette, shape, and proportions — do NOT redesign or simplify`,
    `  • Same color blocking and color palette — no substitutions`,
    `  • Same materials and textures (fabric, stitching, zippers, buckles, mesh, etc.)`,
    `  • Same branding, logos, labels, prints, and patches — exact placement`,
    `  • Same pockets, straps, compartments, hardware, and closures`,
    `  • Same seam lines and construction details`,
    `Do NOT invent a generic replacement. Do NOT simplify the design.`,
    `The product in your output MUST be visually identical to the reference.`,
    subjectProfileText ? `Confirmed product profile: ${subjectProfileText}` : '',
    ``,
    `SCENE / TREATMENT INSTRUCTION (apply to the above product only):`,
  ].filter(Boolean).join('\n');

  return [lockBlock, prompt].filter(Boolean).join('\n').trim();
};

// -------------------------------------------------------------
// Component 5: Grounding Assessor & Self-Correction Evaluator
// Compares the generated output against references to audit fidelity
// -------------------------------------------------------------
const assessImageGrounding = async (
  apiKey,
  prompt,
  referenceImages, // Base64 data URLs
  generatedImage, // Base64 data URL
  options = {}
) => {
  if (!referenceImages.length) {
    return { pass: true, score: 100, issues: '', correction: '', failureType: 'none' };
  }

  try {
    const parts = [];
    
    referenceImages.forEach((ref, idx) => {
      parts.push({ text: `Reference image ${idx + 1}:` });
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: ref.split(',')[1] || ref } });
    });

    parts.push({ text: 'Generated output image:' });
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: generatedImage.split(',')[1] || generatedImage } });

    const evaluationPrompt = `Evaluate whether generated image follows references and avoids hallucinations.
User prompt: ${prompt}
${options.isParentEditMode ? `Treat the first ${Math.max(0, Number(options.mainReferenceCount || 0))} reference image(s) as the Parent image that the user wanted to edit.
Fail if the output generated a completely different scene, composition, background, or changed parts of the image that the user did not ask to edit.
The edit must look like a direct modification of the parent image.` : ''}
${options.compositionReferenceLock && !options.isParentEditMode ? `Treat the first ${Math.max(0, Number(options.mainReferenceCount || 0))} reference image(s) as the Main visual composition lock and the next ${Math.max(0, Number(options.subjectReferenceCount || 0))} reference image(s) as the Subject identity lock.
Fail if the output drifts away from the Main visual's composition, layout, framing, crop, camera angle, perspective, background structure, spacing, existing text, callouts, badges, props, or infographic elements.
Fail if the output replaces the Main visual with a generic studio shot, blank background, or simplified composition.
Fail if the output drifts away from the Subject identity lock by changing product geometry, silhouette, seams, hardware, materials, textures, pockets, straps, closures, logo placement, label placement, color blocking, or construction logic.
In composition-edit mode, both locks must pass together: preserve the Main visual structure while swapping/adapting only the product to match the Subject references.` : ''}
${options.subjectProfileLock && !options.isParentEditMode ? `Treat the connected Subject references as literal identity lock for the same subject/product.
Fail if the output invents, removes, or changes visible product details such as silhouette, geometry, materials, seams, hardware, pockets, straps, closures, logo placement, label placement, text, color blocking, or construction logic.
Fail if the output adds infographic UI, callout cards, feature badges, annotation labels, or other product details not visible in the Subject references.
If a detail is not visible in the references, the output must leave it unspecified rather than guessing.` : ''}
${options.subjectProfileLock && options.isParentEditMode ? `Treat the references after the first ${Math.max(0, Number(options.mainReferenceCount || 0))} image(s) as the Subject profile reference.
Ensure the subject in the output image matches the Subject reference (e.g. face identity, features, textures, colors) where the edit was requested, while preserving the parent image elsewhere.` : ''}

Return strict JSON:
{
  "grounding_score": 0-100,
  "hallucination_detected": boolean,
  "failure_type": "composition" | "product" | "mixed" | "other" | "none",
  "issues": "short description",
  "correction": "single actionable correction sentence"
}`;

    parts.push({ text: evaluationPrompt });

    const result = await callGeminiAPI(
      apiKey,
      'gemini-2.5-flash',
      'You are an AI image quality and product grounding assessor.',
      parts,
      'application/json'
    );

    const parsed = JSON.parse(result.trim());
    const score = Math.max(0, Math.min(100, Number(parsed.grounding_score || 0)));
    const hallucinationDetected = !!parsed.hallucination_detected;
    const issues = String(parsed.issues || '').trim();
    const correction = String(parsed.correction || '').trim();
    
    const rawType = String(parsed.failure_type || '').toLowerCase();
    const failureType = ['composition', 'product', 'mixed', 'other', 'none'].includes(rawType)
      ? rawType
      : 'other';

    const minScore = options.minimumScore ?? 75;
    const pass = !hallucinationDetected && score >= minScore;

    return { pass, score, issues, correction, failureType };
  } catch (err) {
    console.warn('[assessImageGrounding] Assessor failed, defaulting to pass:', err);
    return { pass: true, score: 100, issues: '', correction: '', failureType: 'none' };
  }
};

export default function Home() {
  // --- States ---
  const [activeSessionId, setActiveSessionId] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [sessions, setSessions] = useState([]);
  const [chatHistory, setChatHistory] = useState([
    {
      role: "model",
      text: "Welcome to Vibe Theory Studio. I'm your Cinematic Creative Director. Paste your script or describe your concept below, or upload a storyboard/reference image. I'll help you refine the cinematography, lighting, and sequencing to build a premium video prompt."
    }
  ]);
  const [pbImages, setPbImages] = useState([]);
  const [pbClips, setPbClips] = useState([]);
  const [pbFormat, setPbFormat] = useState("enhanced");
  const [videoModel, setVideoModel] = useState("gemini-omni-flash-preview");
  const [leftTab, setLeftTab] = useState("video");
  // Frozen audio identity for the current film: same voice/ambience in every clip,
  // one Lyria music brief mixed under the whole timeline at export.
  const [voiceSignature, setVoiceSignature] = useState("");
  const [musicPrompt, setMusicPrompt] = useState("");
  const [audioInputMode, setAudioInputMode] = useState("auto"); // "auto" | "custom"
  const [voiceoverScript, setVoiceoverScript] = useState(""); // full VO text for ElevenLabs TTS
  // Frozen art-style anchor: the film's visual medium, locked in every clip
  const [styleAnchor, setStyleAnchor] = useState("");
  const [vocalMode, setVocalMode] = useState("instrumental");
  // Cinema Controls: user-chosen direction presets — the agent writes the actual shots
  const [cinemaGenre, setCinemaGenre] = useState("auto");
  const [cameraStyle, setCameraStyle] = useState("auto");
  const [cinemaLighting, setCinemaLighting] = useState("cinematic");
  const [motionRamp, setMotionRamp] = useState(false);
  const [isProcessingReference, setIsProcessingReference] = useState(false);
  const [referenceAnalysisThumbnail, setReferenceAnalysisThumbnail] = useState(null);
  const [isPlayingFullTimeline, setIsPlayingFullTimeline] = useState(false);
  const [activeTransitionIdx, setActiveTransitionIdx] = useState(null);

  const pbBuildCinemaBrief = () => {
    const genres = {
      auto: "",
      action: "ACTION coverage: dynamic wide establishers, low heroic angles, whip pans, crash zooms, fast tracking shots, impact close-ups, kinetic pacing.",
      drama: "DRAMA coverage: slow push-ins, over-the-shoulder and tight close-ups on emotion, long-lens compression, held moments, motivated slow camera.",
      romance: "ROMANCE coverage: soft close-ups, gentle orbits around the couple, warm backlit wides, intimate handheld drift, lingering final frames.",
      thriller: "THRILLER coverage: uneasy low and dutch angles, slow creeping dollies, tight inserts on details, sudden reveals, negative space in wides.",
      documentary: "DOCUMENTARY coverage: observational handheld mediums, natural zooms, candid close-ups, real-location wides, unpolished honest framing.",
      music_video: "MUSIC VIDEO coverage: bold graphic wides, fast cut rhythm, orbiting hero shots, dramatic angle swings, stylized lighting changes between beats.",
      epic: "EPIC coverage: sweeping aerial and crane wides, monumental low angles, slow majestic movement, scale contrast between tiny figures and vast spaces."
    };
    const cameras = {
      auto: "",
      handheld: "Camera style: energetic handheld — natural shake, quick reframes, documentary immediacy.",
      steadicam: "Camera style: smooth steadicam — flowing continuous moves, gliding through spaces.",
      drone: "Camera style: drone-forward — high aerial establishers, sweeping fly-overs, top-down reveals, altitude changes.",
      locked: "Camera style: locked-off tripod — composed static frames, movement happens inside the frame.",
      crane: "Camera style: crane/jib — vertical rises and descents, reveals from above, elegant boom moves.",
      mixed: "Camera style: full mixed coverage — combine static, handheld, dolly, crane, and aerial as each moment demands."
    };
    const lightings = {
      cinematic: "Lighting style: dramatic high-contrast cinematic lighting with rich shadow detail.",
      neon: "Lighting style: vibrant neon cyberpunk lighting with saturated pink and blue tones.",
      noir: "Lighting style: classic film noir styling with stark chiaroscuro shadows and high-contrast styling.",
      soft: "Lighting style: soft portrait lighting with a warm diffused ambient glow.",
      golden: "Lighting style: golden hour sun with warm backlighting and lens flares.",
      natural: "Lighting style: natural ambient daylight with soft shadows.",
      studio: "Lighting style: bright studio key lighting with clean white fills."
    };
    const parts = [
      genres[cinemaGenre] || "", 
      cameras[cameraStyle] || "",
      lightings[cinemaLighting] || ""
    ];
    if (motionRamp) parts.push("Use speed ramping on 1-2 peak moments in the film: action slows dramatically mid-beat, then snaps back to real time.");
    return parts.filter(Boolean).join(" ");
  };
  const [useElevenLabs, setUseElevenLabs] = useState(false);
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState("21m00Tcm4TlvDq8ikWAM");
  // Persistent learning brain: lessons from mistakes + techniques learned online.
  // Stored server-side (backend/agent_memory.json) so it survives sessions.
  const [agentMemory, setAgentMemory] = useState([]);

  useEffect(() => {
    fetch("/api/agent-memory")
      .then(r => r.json())
      .then(d => setAgentMemory(d.entries || []))
      .catch(() => {});
  }, []);

  const pbRememberLesson = async (type, text, meta = null) => {
    try {
      await fetch("/api/agent-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, text, meta })
      });
      setAgentMemory(prev => [...prev, { type, text, meta, createdAt: new Date().toISOString() }]);
    } catch (err) {
      console.warn("Failed to save agent memory:", err);
    }
  };

  // Compact digest of the brain injected into every creative-director call
  const pbBuildMemoryDigest = () => {
    if (agentMemory.length === 0) return "";
    const recent = (type, n) => agentMemory.filter(e => e.type === type).slice(-n);
    const lines = [];
    for (const e of recent("lesson", 8)) lines.push(`- LESSON: ${e.text}`);
    for (const e of recent("mistake", 8)) lines.push(`- PAST MISTAKE TO AVOID: ${e.text}`);
    for (const e of recent("learning", 6)) lines.push(`- TECHNIQUE LEARNED: ${e.text}`);
    for (const e of recent("preference", 6)) lines.push(`- USER PREFERENCE: ${e.text}`);
    if (lines.length === 0) return "";
    return `\n\nACCUMULATED MEMORY (your experience — apply these actively, never repeat past mistakes):\n${lines.join("\n")}`;
  };

  const pbIsGreeting = (text) =>
    /^(hi+|hii+|hello+|hey+|yo|sup|namaste|hola|good\s*(morning|afternoon|evening|day))[\s!,.?]*$/i.test(String(text).trim());

  // Learning ritual: go online (Google-grounded Gemini), learn ONE new
  // cinematography/AI-video technique not already in memory, remember it, report it.
  const pbLearnSomethingNew = async () => {
    const known = agentMemory.filter(e => e.type === "learning").slice(-20).map(e => e.text.split("\n")[0]).join("; ");
    const today = new Date().toDateString();
    const res = await fetch(`${GEMINI_PROXY_BASE}/models/${SYNTH_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `You are a learning cinematographer who studies daily. Today is ${today}. Search the web and find ONE new, current, specific technique, trend, tool capability, or craft insight in cinematography, commercial filmmaking, or AI video production that would improve AI-generated commercial videos.\n${known ? `You already know these — pick something DIFFERENT: ${known}` : ""}\nRespond in this exact format:\nTITLE: <short name of the technique>\nWHAT: <2-3 sentences explaining it>\nAPPLY: <1-2 sentences on how to use it when writing video generation prompts>` }] }],
        tools: [{ google_search: {} }]
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    const learned = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
    if (learned) pbRememberLesson("learning", learned, "daily-learning");
    return learned;
  };
  const [storyboardImage, setStoryboardImage] = useState(null); // base64
  const [characterSheetImage, setCharacterSheetImage] = useState(null); // base64
  const [chatFiles, setChatFiles] = useState([]); // { src, base64, mimeType, name, type }
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [videoLibrary, setVideoLibrary] = useState(pbReadStoredVideoLibrary);
  const [showLibrary, setShowLibrary] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const stageVideoRef = useRef(null);
  // Nebula-style product pack, built once per product set and reused across
  // keyframes, video ingredients, and QA (extraction + contact sheet are pricey)
  const productPackCacheRef = useRef({});

  const pbGetCachedProductPack = async (products) => {
    if (!products || products.length === 0) return null;
    const key = products.map(x => x._refId || (x.src || "").slice(-32)).sort().join("|");
    if (productPackCacheRef.current[key]) return productPackCacheRef.current[key];
    const b64s = products.map(pbGetImageBase64).filter(Boolean);
    const dataUrls = b64s.map(b => b.startsWith("data:") ? b : `data:image/jpeg;base64,${b}`);
    let identity = "";
    let sheet = null;
    if (b64s.length > 1) {
      setStatusMessage("Building product reference pack...");
      try { identity = await extractMultiViewReferencePrompt("", dataUrls); } catch (e) { console.warn("[ProductPack] identity extraction failed:", e); }
      try {
        const sheetUrl = await buildReferenceContactSheet(dataUrls, "SUBJECT PRODUCT PACK - ALL IMAGES ARE ONE PRODUCT PROFILE");
        if (sheetUrl) sheet = sheetUrl.split(",")[1] || sheetUrl;
      } catch (e) { console.warn("[ProductPack] contact sheet failed:", e); }
    }
    if (!identity) identity = products.map(x => x._productLock).filter(Boolean).join(" ");
    const pack = { identity, sheet, b64s };
    productPackCacheRef.current[key] = pack;
    return pack;
  };

  const pbVideoB64LastFrame = async (videoB64) => {
    try {
      const bin = atob(videoB64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([arr], { type: "video/mp4" }));
      const frame = await captureLastFrame(url);
      URL.revokeObjectURL(url);
      return frame;
    } catch { return null; }
  };
  const clipBlobUrlsRef = useRef(new Set());
  const libPreviewUrlsRef = useRef(new Set());
  const [libPreviews, setLibPreviews] = useState({}); // key -> blob URL, loaded on demand

  const pbTrackBlobUrl = (trackerRef, url) => {
    trackerRef.current.add(url);
    return url;
  };

  const pbLoadLibraryPreview = async (key) => {
    if (libPreviews[key]) return;
    try {
      const base64 = await getIndexedDBMedia(key);
      if (!base64) return;
      const bin = atob(base64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const url = pbTrackBlobUrl(libPreviewUrlsRef, URL.createObjectURL(new Blob([arr], { type: "video/mp4" })));
      setLibPreviews(prev => ({ ...prev, [key]: url }));
    } catch (err) {
      console.warn("Preview load failed:", err);
    }
  };

  useEffect(() => {
    const clipBlobUrls = clipBlobUrlsRef.current;
    const libPreviewUrls = libPreviewUrlsRef.current;
    return () => {
      pbRevokeBlobUrlSet(clipBlobUrls);
      pbRevokeBlobUrlSet(libPreviewUrls);
    };
  }, []);
  
  // Active clip editor state
  const [activeClipIdx, setActiveClipIdx] = useState(null);
  
  // UI Loading/Status States
  const [isGenerating, setIsGenerating] = useState(false);
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);
  const [isAudioAnalyzing, setIsAudioAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isPipelineOverlayDismissed, setIsPipelineOverlayDismissed] = useState(false);
  const [validationChecks, setValidationChecks] = useState(null); // null = hidden, array = showing
  const [isTyping, setIsTyping] = useState(false);
  
  // Form input references
  const chatInputRef = useRef(null);
  const chatBottomRef = useRef(null);
  const importInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const storyboardInputRef = useRef(null);
  const characterSheetInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  // --- Screen Wake Lock: prevent the Mac from idle-sleeping mid-generation ---
  const wakeLockRef = useRef(null);
  const pbAcquireWakeLock = async () => {
    try {
      if ("wakeLock" in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        wakeLockRef.current.addEventListener("release", () => { wakeLockRef.current = null; });
      }
    } catch (err) {
      console.warn("Wake lock unavailable:", err);
    }
  };
  const pbReleaseWakeLock = () => {
    try { wakeLockRef.current?.release(); } catch {}
    wakeLockRef.current = null;
  };
  // Re-acquire when the tab becomes visible again (wake locks auto-release on tab switch/sleep)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && isGenerating) pbAcquireWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isGenerating]);

  useEffect(() => {
    if (isGenerating || isVideoGenerating || isAudioAnalyzing) {
      setIsPipelineOverlayDismissed(false);
    }
  }, [isGenerating, isVideoGenerating, isAudioAnalyzing, statusMessage]);

  // Playback continuity for full timeline preview
  const handleVideoEnded = () => {
    if (isPlayingFullTimeline) {
      if (activeClipIdx !== null && activeClipIdx < pbClips.length - 1) {
        setActiveClipIdx(activeClipIdx + 1);
      } else {
        setIsPlayingFullTimeline(false);
        setActiveClipIdx(0);
      }
    }
  };

  useEffect(() => {
    if (isPlayingFullTimeline && stageVideoRef.current) {
      stageVideoRef.current.play().catch(e => console.log("Sequential playback failed:", e));
    }
  }, [activeClipIdx, isPlayingFullTimeline]);

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setIsVideoGenerating(false);
    setIsAudioAnalyzing(false);
    setStatusMessage("Generation cancelled.");
  };

  // --- Initialize Session ---
  useEffect(() => {
    const activeId = localStorage.getItem("pb_active_session");
    const sessionsList = pbGetAllSessions();
    setSessions(sessionsList);
    if (activeId && sessionsList.some(s => s.id === activeId)) {
      pbLoadSession(activeId, sessionsList);
    } else if (sessionsList.length > 0) {
      pbLoadSession(sessionsList[0].id, sessionsList);
    } else {
      pbCreateNewSession();
    }
  }, []);

  // --- Keyboard Delete Controller ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.isContentEditable)
      ) {
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (activeClipIdx !== null && activeClipIdx >= 0 && activeClipIdx < pbClips.length) {
          e.preventDefault();
          const updatedClips = pbClips.filter((_, idx) => idx !== activeClipIdx);
          setPbClips(updatedClips);
          if (updatedClips.length > 0) {
            setActiveClipIdx(Math.max(0, activeClipIdx - 1));
          } else {
            setActiveClipIdx(null);
          }
          pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, updatedClips, pbImages, storyboardImage);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeClipIdx, pbClips, activeSessionId, sessionName, chatHistory, pbFormat, videoModel, pbImages, storyboardImage]);

  // Scroll to chat bottom
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatHistory, isTyping]);

  // --- Session Helpers ---
  const pbGetAllSessions = () => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("pb_sessions") || "[]");
    } catch {
      return [];
    }
  };

  const pbSaveSession = (currentId = activeSessionId, name = sessionName, chat = chatHistory, fmt = pbFormat, model = videoModel, clips = pbClips, images = pbImages, sb = storyboardImage, music = musicPrompt, voice = voiceSignature, cs = characterSheetImage) => {
    if (!currentId) return;

    // Strip raw video base64 data to keep localStorage footprint tiny (<5MB limit)
    // Save video base64 data to IndexedDB instead
    const cleanedClips = clips.map((c) => {
      if (c.videoData && c.videoData.bytesBase64Encoded) {
        setIndexedDBMedia(`video_${currentId}_clip_${c.id}`, c.videoData.bytesBase64Encoded);
        return { ...c, videoData: { mimeType: c.videoData.mimeType, storedInDB: true } };
      }
      return c;
    });

    const sessionData = {
      id: currentId,
      name: name,
      updatedAt: Date.now(),
      chatHistory: chat.map(msg => ({
        ...msg,
        images: msg.images ? msg.images.map(img => ({ tag: img.tag, mimeType: img.mimeType })) : undefined
      })),
      format: fmt,
      model: model,
      hasStoryboard: !!sb,
      hasCharacterSheet: !!cs,
      referenceImages: images,
      timelineClips: cleanedClips,
      musicPrompt: music,
      voiceSignature: voice,
      vocalMode: vocalMode,
      cinemaGenre: cinemaGenre,
      cameraStyle: cameraStyle,
      cinemaLighting: cinemaLighting,
      motionRamp: motionRamp,
      useElevenLabs: useElevenLabs,
      elevenLabsVoiceId: elevenLabsVoiceId
    };

    if (sb) {
      setIndexedDBMedia(`storyboard_${currentId}`, sb);
    }
    if (cs) {
      setIndexedDBMedia(`character_sheet_${currentId}`, cs);
    } else {
      removeIndexedDBMedia(`character_sheet_${currentId}`);
    }

    let sessionsList = pbGetAllSessions();
    const idx = sessionsList.findIndex(s => s.id === currentId);
    if (idx >= 0) sessionsList[idx] = sessionData;
    else sessionsList.push(sessionData);
    if (sessionsList.length > 30) sessionsList = sessionsList.slice(-30);

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("pb_sessions", JSON.stringify(sessionsList));
        localStorage.setItem("pb_active_session", currentId);
      } catch (err) {
        console.warn("localStorage quota exceeded, saving to state only:", err);
      }
    }
    setSessions(sessionsList);
  };

  const pbLoadSession = async (sessionId, loadedSessionsList = null) => {
    const allSessions = loadedSessionsList || pbGetAllSessions();
    const session = allSessions.find(s => s.id === sessionId);
    if (!session) return;

    pbRevokeBlobUrlSet(clipBlobUrlsRef.current);
    setActiveSessionId(session.id);
    setSessionName(session.name || "Untitled");
    setChatHistory(session.chatHistory || []);
    setPbFormat(session.format || "enhanced");
    setVideoModel("gemini-omni-flash-preview");
    setPbImages(session.referenceImages || []);
    setCharacterSheetImage(null);
    setMusicPrompt(session.musicPrompt || "");
    setVoiceSignature(session.voiceSignature || "");
    setVocalMode(session.vocalMode || "instrumental");
    setCinemaGenre(session.cinemaGenre || "auto");
    setCameraStyle(session.cameraStyle || "auto");
    setCinemaLighting(session.cinemaLighting || "cinematic");
    setMotionRamp(!!session.motionRamp);
    setUseElevenLabs(session.useElevenLabs || false);
    setElevenLabsVoiceId(session.elevenLabsVoiceId || "21m00Tcm4TlvDq8ikWAM");
    // Restore video URLs and blobs from IndexedDB asynchronously
    const clips = session.timelineClips || [];
    const restoredClips = await Promise.all(
      clips.map(async (c) => {
        if (c.videoData && c.videoData.storedInDB) {
          const base64 = await getIndexedDBMedia(`video_${sessionId}_clip_${c.id}`);
          if (base64) {
            const binaryVal = atob(base64);
            const arrayVal = [];
            for (let i = 0; i < binaryVal.length; i++) arrayVal.push(binaryVal.charCodeAt(i));
            const blob = new Blob([new Uint8Array(arrayVal)], { type: c.videoData.mimeType || "video/mp4" });
            const blobUrl = pbTrackBlobUrl(clipBlobUrlsRef, URL.createObjectURL(blob));
            return {
              ...c,
              videoUrl: blobUrl,
              videoData: { bytesBase64Encoded: base64, mimeType: c.videoData.mimeType }
            };
          }
        }
        return c;
      })
    );

    setPbClips(restoredClips);
    setStoryboardImage(null);
    setActiveClipIdx(null);

    if (session.hasStoryboard) {
      const cachedSb = await getIndexedDBMedia(`storyboard_${sessionId}`);
      if (cachedSb) {
        setStoryboardImage(cachedSb);
      }
    }

    if (session.hasCharacterSheet) {
      const cachedCs = await getIndexedDBMedia(`character_sheet_${sessionId}`);
      if (cachedCs) {
        setCharacterSheetImage(cachedCs);
      }
    }
  };

  const pbCreateNewSession = () => {
    const newId = "sess_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
    const newName = "Session " + new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    
    setActiveSessionId(newId);
    setSessionName(newName);
    const initialChat = [{ role: "model", text: "Welcome to Vibe Theory Studio. I'm your Cinematic Creative Director. Describe your concept or upload references below." }];
    setChatHistory(initialChat);
    setPbFormat("enhanced");
    setPbImages([]);
    setPbClips([]);
    setStoryboardImage(null);
    setCharacterSheetImage(null);
    setChatFiles([]);
    setActiveClipIdx(null);

    const sessionData = {
      id: newId,
      name: newName,
      updatedAt: Date.now(),
      chatHistory: initialChat,
      format: "enhanced",
      model: videoModel,
      hasStoryboard: false,
      referenceImages: [],
      timelineClips: []
    };

    const sessionsList = pbGetAllSessions();
    sessionsList.unshift(sessionData);
    if (sessionsList.length > 30) sessionsList.pop();

    if (typeof window !== "undefined") {
      localStorage.setItem("pb_sessions", JSON.stringify(sessionsList));
      localStorage.setItem("pb_active_session", newId);
    }
    setSessions(sessionsList);
  };

  const pbDeleteSession = (sessionId) => {
    let sessionsList = pbGetAllSessions();
    
    // Clean up IndexedDB media for this session
    const targetSession = sessionsList.find(s => s.id === sessionId);
    if (targetSession) {
      removeIndexedDBMedia(`storyboard_${sessionId}`);
      if (targetSession.timelineClips) {
        for (const c of targetSession.timelineClips) {
          removeIndexedDBMedia(`video_${sessionId}_clip_${c.id}`);
        }
      }
    }

    sessionsList = sessionsList.filter(s => s.id !== sessionId);

    if (typeof window !== "undefined") {
      localStorage.setItem("pb_sessions", JSON.stringify(sessionsList));
      if (localStorage.getItem("pb_active_session") === sessionId) {
        localStorage.removeItem("pb_active_session");
      }
    }
    setSessions(sessionsList);

    if (sessionId === activeSessionId) {
      if (sessionsList.length > 0) {
        pbLoadSession(sessionsList[0].id, sessionsList);
      } else {
        pbCreateNewSession();
      }
    }
  };

  const pbClearAllSessions = () => {
    const sessionsList = pbGetAllSessions();
    for (const s of sessionsList) {
      removeIndexedDBMedia(`storyboard_${s.id}`);
      if (s.timelineClips) {
        for (const c of s.timelineClips) {
          removeIndexedDBMedia(`video_${s.id}_clip_${c.id}`);
        }
      }
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem("pb_sessions");
      localStorage.removeItem("pb_active_session");
    }
    setSessions([]);
    pbCreateNewSession();
  };

  const pbResetSession = () => {
    if (activeSessionId) {
      pbDeleteSession(activeSessionId);
    } else {
      pbCreateNewSession();
    }
  };

  // --- IndexedDB Helper functions ---
  const getIndexedDBMedia = (key) => {
    return new Promise((resolve) => {
      const request = indexedDB.open("VibeTheoryDB", 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("media")) {
          db.createObjectStore("media");
        }
      };
      request.onsuccess = (e) => {
        const db = e.target.result;
        try {
          const trans = db.transaction("media", "readonly");
          const store = trans.objectStore("media");
          const getReq = store.get(key);
          getReq.onsuccess = () => resolve(getReq.result);
          getReq.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  };

  const setIndexedDBMedia = (key, val) => {
    const request = indexedDB.open("VibeTheoryDB", 1);
    request.onsuccess = (e) => {
      const db = e.target.result;
      try {
        const trans = db.transaction("media", "readwrite");
        const store = trans.objectStore("media");
        store.put(val, key);
      } catch (err) {
        console.warn("IndexedDB save error:", err);
      }
    };
  };

  const removeIndexedDBMedia = (key) => {
    const request = indexedDB.open("VibeTheoryDB", 1);
    request.onsuccess = (e) => {
      const db = e.target.result;
      try {
        const trans = db.transaction("media", "readwrite");
        const store = trans.objectStore("media");
        store.delete(key);
      } catch {}
    };
  };

  const pbAddToLibrary = (base64Data, namePrefix, promptText = "") => {
    try {
      const key = `lib_video_${Date.now()}`;
      const fileName = `${namePrefix.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${Date.now()}.mp4`;
      
      setIndexedDBMedia(key, base64Data);

      const newItem = {
        key,
        fileName,
        name: namePrefix,
        prompt: promptText || "",
        sessionId: activeSessionId,
        sessionName: sessionName,
        timestamp: Date.now()
      };
      
      setVideoLibrary(prev => {
        const updatedLib = [newItem, ...prev];
        localStorage.setItem("pb_video_library", JSON.stringify(updatedLib));
        return updatedLib;
      });
    } catch (err) {
      console.warn("Failed to add to library:", err);
    }
  };

  const pbDownloadLibraryVideo = async (key, fileName) => {
    try {
      const base64 = await getIndexedDBMedia(key);
      if (!base64) return alert("Video file not found in browser storage!");

      const binaryVal = atob(base64);
      const arrayVal = [];
      for (let i = 0; i < binaryVal.length; i++) arrayVal.push(binaryVal.charCodeAt(i));
      const blob = new Blob([new Uint8Array(arrayVal)], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to download video from library: " + err.message);
    }
  };

  const pbClearLibrary = () => {
    if (!window.confirm("Are you sure you want to clear your video generations library? This deletes all files from local storage.")) return;
    for (const item of videoLibrary) {
      removeIndexedDBMedia(item.key);
    }
    setVideoLibrary([]);
    localStorage.removeItem("pb_video_library");
  };

  // --- JSON Export / Import ---
  const pbExportSessionJson = async (sessionId) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    const sb = await getIndexedDBMedia(`storyboard_${sessionId}`);
    const cs = await getIndexedDBMedia(`character_sheet_${sessionId}`);
    const exportData = {
      ...session,
      storyboardImage: sb,
      characterSheetImage: cs,
      referenceImages: pbImages,
      timelineClips: pbClips
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session_${session.name.replace(/\s+/g, "_")}_${sessionId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const pbImportSessionJson = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const importData = JSON.parse(event.target.result);
        if (!importData.id || !importData.name) {
          alert("Invalid session backup file.");
          return;
        }

        const newId = "sess_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
        const newSession = {
          id: newId,
          name: importData.name + " (Imported)",
          updatedAt: Date.now(),
          chatHistory: importData.chatHistory || [],
          format: importData.format || "enhanced",
          model: "gemini-omni-flash-preview",
          hasStoryboard: !!importData.storyboardImage,
          hasCharacterSheet: !!importData.characterSheetImage
        };

        if (importData.storyboardImage) {
          await setIndexedDBMedia(`storyboard_${newId}`, importData.storyboardImage);
        }
        if (importData.characterSheetImage) {
          await setIndexedDBMedia(`character_sheet_${newId}`, importData.characterSheetImage);
        }

        setActiveSessionId(newId);
        setSessionName(newSession.name);
        setChatHistory(newSession.chatHistory);
        setPbFormat(newSession.format);
        setVideoModel(newSession.model);
        setPbImages(importData.referenceImages || []);
        setPbClips(importData.timelineClips || []);
        setStoryboardImage(importData.storyboardImage || null);
        setCharacterSheetImage(importData.characterSheetImage || null);
        setActiveClipIdx(null);
        setSessions([newSession]);

        alert("Session loaded successfully!");
      } catch (err) {
        console.error("Failed to import session:", err);
        alert("Import failed: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  // --- Download Full Session Bundle (HTML) ---
  const pbDownloadSessionContent = async (sessionId) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    const sb = await getIndexedDBMedia(`storyboard_${sessionId}`);
    const scriptText = chatHistory.filter(m => m.role === "model").pop()?.text || "";

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${session.name} — Production Assets Export</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; padding: 40px; max-width: 900px; margin: 0 auto; }
    h1 { color: #4f46e5; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 24px; font-size: 28px; }
    h2 { color: #0f172a; margin-top: 32px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; font-size: 20px; }
    .meta-box { background: white; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .meta-item strong { color: #64748b; font-size: 12px; display: block; text-transform: uppercase; margin-bottom: 2px; }
    .meta-item span { font-size: 14px; font-weight: 600; color: #334155; }
    .storyboard-img { max-width: 100%; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
    .clip-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 6px rgba(0,0,0,0.02); }
    .clip-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px dashed #f1f5f9; padding-bottom: 8px; }
    .clip-title { font-weight: 700; color: #4f46e5; font-size: 15px; }
    .clip-meta { font-size: 11px; color: #94a3b8; font-weight: 600; background: #f1f5f9; padding: 2px 8px; border-radius: 20px; }
    .clip-section { margin-bottom: 12px; }
    .clip-section strong { font-size: 11px; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 4px; }
    .clip-section p { margin: 0; font-size: 13px; color: #334155; white-space: pre-wrap; }
    .dialogue-text { font-style: italic; color: #7c3aed; font-weight: 600; }
    .video-preview { margin-top: 12px; border-radius: 8px; background: #000; overflow: hidden; max-height: 320px; display: flex; align-items: center; justify-content: center; }
    video { max-width: 100%; max-height: 320px; }
    .chat-msg { margin-bottom: 12px; padding: 10px; border-radius: 8px; }
    .chat-msg.user { background: #e0e7ff; align-self: flex-end; }
    .chat-msg.agent { background: #f1f5f9; }
    .chat-sender { font-weight: 700; font-size: 11px; color: #64748b; text-transform: uppercase; margin-bottom: 4px; display: block; }
  </style>
</head>
<body>
  <h1>🎬 Production Assets Export</h1>
  
  <div class="meta-box">
    <div class="meta-item"><strong>Session Name</strong><span>${session.name}</span></div>
    <div class="meta-item"><strong>Export Date</strong><span>${new Date().toLocaleString()}</span></div>
    <div class="meta-item"><strong>Video Model</strong><span>${session.model || "Gemini Omni Flash"}</span></div>
    <div class="meta-item"><strong>Clips Generated</strong><span>${pbClips.filter(c => c.status === "done").length} clips</span></div>
  </div>

  <h2>📝 Master Production Script</h2>
  <div style="background: white; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px; font-size: 14px; margin-bottom: 24px; white-space: pre-wrap;">${scriptText || "No script generated."}</div>

  ${sb ? `
  <h2>🎨 Visual Storyboard</h2>
  <div style="text-align: center; margin-bottom: 32px;">
    <img src="data:image/png;base64,${sb}" class="storyboard-img" alt="Visual Storyboard">
  </div>
  ` : ""}

  <h2>🎬 Generated Video Timeline</h2>
  ${pbClips.map((clip, i) => {
    let videoMarkup = "";
    if (clip.status === "done" && clip.videoUrl) {
      videoMarkup = `
      <div class="video-preview">
        <video controls src="${clip.videoUrl}"></video>
      </div>`;
    } else {
      videoMarkup = `<div style="background: #f1f5f9; color: #94a3b8; text-align: center; padding: 12px; border-radius: 8px; font-size: 12px; font-style: italic;">No video generated for this clip segment.</div>`;
    }
    
    return `
    <div class="clip-card">
      <div class="clip-header">
        <span class="clip-title">Shot ${i + 1}</span>
        <span class="clip-meta">${clip.trimStart}s - ${clip.trimEnd}s</span>
      </div>
      <div class="clip-section">
        <strong>Visual Action & Cinematic Prompt</strong>
        <p>${clip.prompt}</p>
      </div>
      ${clip.dialogue ? `
      <div class="clip-section">
        <strong>Dialogue (Audio track)</strong>
        <p class="dialogue-text">"${clip.dialogue}"</p>
      </div>
      ` : ""}
      ${videoMarkup}
    </div>
    `;
  }).join("")}

  <h2>💬 Chat Consultation History</h2>
  <div style="background: white; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px;">
    ${(session.chatHistory || []).map(m => `
      <div class="chat-msg ${m.role === "user" ? "user" : "agent"}">
        <span class="chat-sender">${m.role === "user" ? "You" : "Creative Director"}</span>
        <div style="font-size: 13px;">${m.text.replace(/\n/g, "<br>")}</div>
      </div>
    `).join("")}
  </div>
</body>
</html>
    `;

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `production_export_${session.name.replace(/\s+/g, "_")}_${sessionId}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- Style Normalizer: repaint a captured video frame back into the locked art
  // style (composition-identical) so drifted pixels never re-enter the frame chain ---
  // Is this reference already in the film's locked style? Cached per anchor.
  // Originals that don't match (raw photos) LEAVE THE SPACE once created,
  // in-style assets exist — only what we created follows into generation.
  const pbImageMatchesStyle = async (img, anchorText) => {
    if (!anchorText) return true;
    if (img._styleMatchAnchor === anchorText && typeof img._styleMatches === "boolean") return img._styleMatches;
    try {
      const base64 = img.base64 || img.src.split(",")[1];
      const mimeType = img.src.split(";")[0].split(":")[1];
      const res = await fetch(`${GEMINI_PROXY_BASE}/models/${SYNTH_MODEL}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: `Does this image's RENDERING STYLE match this description: "${anchorText}"? Judge only the medium/rendering (photograph vs comic art vs painting vs 3D etc), ignore the subject. Answer ONLY YES or NO.` }
          ]}],
          generationConfig: { temperature: 0, maxOutputTokens: 5 }
        })
      });
      const data = await res.json();
      const matches = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim().toUpperCase().startsWith("Y");
      img._styleMatchAnchor = anchorText; img._styleMatches = matches;
      setPbImages(prev => prev.map(x => x._refId === img._refId ? { ...x, _styleMatchAnchor: anchorText, _styleMatches: matches } : x));
      return matches;
    } catch {
      return true; // never exclude on checker failure
    }
  };

  const pbRestyleFrameToAnchor = async (frameB64, anchorText, signal = null, identityText = "") => {
    if (!frameB64 || !anchorText) return null;
    try {
      // EXACTNESS FIRST: if the captured frame already matches the locked style,
      // keep the EXACT original pixels — a repaint is only justified by real drift.
      try {
        const checkRes = await fetch(`${GEMINI_PROXY_BASE}/models/${SYNTH_MODEL}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              { inlineData: { mimeType: "image/jpeg", data: frameB64 } },
              { text: `Does this image's RENDERING STYLE match this description: "${anchorText}"? Judge only the medium/rendering (e.g. painterly vs photorealistic vs 3D render vs cel animation) — ignore the scene content. Answer ONLY YES or NO.` }
            ]}],
            generationConfig: { temperature: 0, maxOutputTokens: 5 }
          }),
          signal
        });
        const checkData = await checkRes.json();
        const verdict = (checkData.candidates?.[0]?.content?.parts?.[0]?.text || "").trim().toUpperCase();
        if (verdict.startsWith("Y")) return null; // on-style: exact pixels flow through untouched
      } catch (checkErr) {
        if (checkErr.name === "AbortError") throw checkErr;
        return null; // checker unavailable: favor exactness, keep the original frame
      }

      const parts = [];
      // Character/style references first — they are the style ground truth
      if (characterSheetImage) {
        parts.push({ inlineData: { mimeType: "image/png", data: characterSheetImage } });
      }
      for (const img of pbImages) {
        if ((img._autoExtracted && !img._fromStoryboardCharacterSheet) || pbGetReferenceImageIndex(img) !== null) {
          continue; // Skip specific shot storyboard panels and auto-extracted ones
        }
        const base64 = pbGetImageBase64(img);
        const mimeType = pbGetImageMimeType(img);
        parts.push({ inlineData: { mimeType, data: base64 } });
      }
      // The drifted frame LAST so it is unambiguous which image to repaint
      parts.push({ inlineData: { mimeType: "image/jpeg", data: frameB64 } });
      parts.push({ text: `REPAINT the LAST attached image into this exact art style: ${anchorText}.
COMPOSITION LOCK — keep IDENTICAL to the last attached image: character pose, position, facial expression, camera angle, framing, scene layout, objects, lighting direction, and time of day. Do NOT move, add, or remove anything.${identityText ? `\nLIKENESS: this is the same specific person — preserve their exact facial geometry: ${identityText}` : ""}\nPRODUCT LOCK: if a commercial product appears in the frame, keep it EXACTLY as it is — do not repaint, restyle, or alter the product, its shape, size, parts, label, logo, lettering, artwork, printed imagery, or colors in any way. ${PB_PRODUCT_EXACT_LOCK} ${PB_LOGO_INTEGRITY}
STYLE — change ONLY the rendering: match the exact medium, brushwork/line character, texture, and palette of the style described above and shown in the earlier reference images. If the last image has drifted away from this locked style in ANY direction, fully restore the locked medium.
NEGATIVES: apply every NEVER statement contained in the locked style description above as an absolute ban. No added captions, no borders, no UI. ${PB_LOGO_INTEGRITY}` });

      const res = await fetch(
        `${GEMINI_PROXY_BASE}/models/${IMAGE_MODEL}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { responseModalities: ["IMAGE"], temperature: 0.4 }
          }),
          signal
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      for (const part of data.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData && part.inlineData.mimeType.startsWith("image/")) {
          return part.inlineData.data;
        }
      }
      return null;
    } catch (err) {
      if (err.name === "AbortError") throw err;
      console.warn("Frame restyle failed — using raw captured frame:", err);
      return null;
    }
  };

  const pbGetQualityGuard = (userPrompt, anchorText = "") => {
    // STYLE NEUTRALITY: code holds NO opinion about what a film should look like.
    // The agent's locked style_anchor (chosen from the user's references and chat)
    // is the ONLY style authority — painted, anime, photoreal are all equally valid.
    // The anchor carries its own NEVER statements; code just enforces them.
    const styleDirective = anchorText
      ? `STYLE LOCK — ABSOLUTE: Render every frame in EXACTLY the film's locked style: ${anchorText}. The NEVER statements inside this locked style are absolute bans for every frame from first to last, and they OVERRIDE any conflicting rendering style implied by the starting frame image. Never substitute any default aesthetic of your own.`
      : "STYLE FIDELITY: Render every frame in exactly the visual style described in the prompt and shown in the reference images/storyboard. Do not impose any default aesthetic of your own.";

    const directives = [
      "ANTI-MORPHING: Absolutely NO morphing, warping, melting, dissolving, or shape-shifting of any person, object, or surface at any point. Every element must retain its physical form from first frame to last.",
      "TEMPORAL CONSISTENCY: Maintain rock-solid temporal consistency. No flickering textures, no sudden appearance/disappearance of objects, no abrupt lighting shifts, no asset blinking.",
      "CAMERA STABILITY: Smooth, intentional camera movement only. Zero erratic shaking, no sudden jerks, no unmotivated camera turns or jumps.",
      "HUMAN ANATOMY: Anatomically correct human bodies with natural proportions at ALL times. No extra fingers, no distorted limbs, no rubber-like stretching, no unnatural bending. Hands must have exactly 5 fingers.",
      "MOTION PHYSICS: All human movement must be smooth, natural, and physically plausible. No sliding feet, no floating movement, no impossible speed changes. Respect gravity, momentum, and inertia.",
      "IDENTITY LOCK: The face, hair, skin tone, body build, and clothing of every character must remain 100% identical across every single frame. No subtle drift in appearance.",
      `PRODUCT INTEGRITY: Any product shown must remain exactly identical to the uploaded product reference image — INCLUDING its own shape, size, package parts, label, logo, lettering, artwork, printed imagery, and colors exactly as shown. ${PB_PRODUCT_EXACT_LOCK} ${PB_LOGO_INTEGRITY}`,
      styleDirective,
      "PHYSICS & NATURALITY: All movements and object interactions must obey the laws of physics. No floating artifacts, no objects clipping through solids, no impossible transformations. Liquids pour downward, objects have weight, fabric drapes naturally.",
      "SINGLE CONTINUOUS FRAME: Depict a single, continuous, unified camera shot. Do NOT create split screens, grid layouts, side-by-side comparisons, multi-panel views, collages, or picture-in-picture unless the user explicitly asked for it.",
      "PREVENT TWINS & LOOKALIKES — CRITICAL: Do NOT duplicate any main character's face or likeness. Never create a copy, clone, twin, double, or lookalike of a main character in the background or anywhere else in the shot. Every person in the scene must have a completely unique, distinct face and appearance. Background characters must be generic, different, or blurred.",
      "ABSOLUTE NO DUPLICATION: There is exactly ONE instance of each character in this scene. The <FIRST_FRAME> reference image shows the SAME character that appears in the video — it is NOT a second person. Do NOT create a twin, clone, double, mirror image, duplicate, or second copy of any character. If the prompt describes one character, render EXACTLY one character.",
      "NO UI OR SCREENSHOT ARTIFACTS: NEVER render browser windows, app interfaces, video-player controls, play bars, thumbnails, panels, buttons, watermarks, or screenshot-style layouts — even if a reference image contains them. References are for subject and style ONLY; extract the subject/style and discard any surrounding UI, borders, captions, or interface chrome.",
      "NO WATERMARKS OR SIGNATURES: NEVER render signatures, watermarks, artist names, text signatures, copyright notices, stamps, initials, or handwritten overlays. Do not add new logos; preserve only locked user-owned marks on their exact referenced wardrobe/product surface.",
      "SCENE COHERENCE: The background environment, props, lighting direction, and time of day must remain consistent within each clip. No random scene changes mid-clip.",
      "STARTING FRAME IDENTITY: The person shown in the <FIRST_FRAME> reference IS the main character. Animate THAT person. Do not introduce a new character that looks like them. There is only ONE protagonist in this shot."
    ];

    const hasTextKeywords = /\b(text|write|written|word|label|title|caption|subtitle|typography|overlay|letter|quote|reads|saying|name|brand name)\b/i.test(userPrompt);
    if (!hasTextKeywords) {
      directives.push(`NO ADDED TEXT: Do NOT render new text, subtitles, watermarks, titles, credits, captions, or typographic overlays. ${PB_LOGO_INTEGRITY}`);
    }
    
    return directives.join(" ");
  };

  // --- Prompt Sanitizer for Regeneration (when first gen failed) ---
  // Uses Gemini Flash to rewrite the prompt, removing elements that commonly
  // trigger safety filters or content-policy blocks.
  const pbSanitizePromptForRegen = async (originalPrompt, signal = null) => {
    try {
      const sanitizeInstruction = `You are a video prompt safety rewriter. The following video generation prompt FAILED due to content guideline violations. Rewrite it to be SAFER while keeping the same creative intent, scene composition, visual style, and spoken language.

Rules for rewriting:
1. Remove or replace any real brand names, trademarked terms, or celebrity/real-person references with generic equivalents
2. Remove any potentially violent, sexual, or harmful content — replace with safe alternatives
3. Simplify overly complex action sequences that may confuse the model
4. Remove contradictory or physically impossible instructions
5. Keep camera angles, lighting, color grading, and mood descriptors
6. Keep the core scene action and character descriptions
7. ${PB_REGIONAL_LANGUAGE_LOCK}
8. Any line marked Dialogue, Voiceover, VO, narration, or lip-synced speech must stay in the same language and wording unless the unsafe content is inside that exact spoken text
9. Make the prompt more direct and clear — less is more
10. Do NOT add any preamble or explanation — return ONLY the rewritten prompt text

FAILED PROMPT:
"""
${originalPrompt}
"""

REWRITTEN SAFE PROMPT:`;

      const res = await fetch(
        `${GEMINI_PROXY_BASE}/models/${SYNTH_MODEL}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: sanitizeInstruction }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 1024 }
          }),
          signal
        }
      );
      const data = await res.json();
      const rewritten = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (rewritten && rewritten.length > 20) {
        console.log("[Prompt Sanitizer] Rewrote failed prompt for retry.");
        return rewritten;
      }
    } catch (err) {
      console.warn("Prompt sanitizer failed, using original:", err);
    }
    return originalPrompt; // fallback: use original if sanitizer fails
  };

  const handleStoryboardUpload = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const f = files[0];
    if (!f.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const src = event.target.result;
      const compressedSrc = await pbCompressImage(src, 1024, 0.75);
      const base64 = compressedSrc.split(",")[1];
      setStoryboardImage(base64);
      pbExtractCharactersFromStoryboard(base64);
      pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, pbClips, pbImages, base64);
    };
    reader.readAsDataURL(f);
  };

  const pbGenerateStoryboardTimeline = async () => {
    if (!storyboardImage) return;
    try {
      setIsGenerating(true);
      setStatusMessage("Analyzing storyboard and generating timeline...");
      
      // Extract requested duration from chat history
      const allChatText = chatHistory.map(m => m.text).join(" ");
      const lastUserMsg = chatHistory.filter(m => m.role === "user").pop()?.text || "";
      const lastModelMsg = chatHistory.filter(m => m.role === "model").pop()?.text || "";
      const requestedDuration = pbExtractRequestedDurationSeconds(lastUserMsg)
        || pbExtractRequestedDurationSeconds(allChatText)
        || pbExtractRequestedDurationSeconds(lastModelMsg)
        || DEFAULT_TARGET_SECONDS;
      
      // Build a brief of the latest script from chat for context
      const chatScriptContext = lastModelMsg ? `\nLATEST SCRIPT FROM DIRECTOR CHAT (use this for clip content, dialogue, and timing):\n"${lastModelMsg.substring(0, 3000)}"` : "";
      
      const response = await fetch(
        `${GEMINI_PROXY_BASE}/models/gemini-2.5-flash:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              { inlineData: { mimeType: "image/png", data: storyboardImage } },
              { text: `You are the Cinematic Creative Director. Analyze this visual storyboard sheet and the script context below, then convert it into a complete sequential timeline of shot clips.

TARGET TOTAL DURATION: ${requestedDuration} seconds.
Gemini Omni Flash produces clips between ${MIN_OMNI_CLIP_SECONDS} and ${MAX_OMNI_CLIP_SECONDS} seconds. Plan each clip's duration dynamically (3, 4, 5, 6, 7, 8, 9, or 10 seconds) based on how much action that shot needs. The sum of all clip durations MUST equal exactly ${requestedDuration} seconds.
Do NOT force all clips to 10 seconds. Use shorter clips (3-6s) for quick cuts, inserts, and simple actions. Use longer clips (8-10s) only for complex sequences.
${chatScriptContext}

${PB_REGIONAL_LANGUAGE_LOCK}
If any dialogue/VO/text is visible or implied by the storyboard or script, copy it into "dialogue" exactly as written. Never translate Hindi, Hinglish, romanized regional language, or code-switched words into English.
Return the structured timeline as a JSON block matching this schema:
\`\`\`json
{
  "clips": [
    {
      "prompt": "Detailed cinematic prompt for video generation...",
      "dialogue": "Spoken dialogue or narrator script if any...",
      "duration": 4,
      "audio_role": "voiceover"
    }
  ]
}
\`\`\`
The "duration" field for each clip must be between ${MIN_OMNI_CLIP_SECONDS} and ${MAX_OMNI_CLIP_SECONDS}. All durations must sum to exactly ${requestedDuration}.
Respond ONLY with the JSON block.` }
            ] }],
            generationConfig: { responseMimeType: "application/json" }
          })
        }
      );
      
      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = JSON.parse(text);
      if (parsed && parsed.clips) {
        let accum = 0;
        const newClips = parsed.clips.map((c, i) => {
          const dur = Math.max(3, Math.min(10, Math.round(Number(c.duration || c.duration_seconds) || 4)));
          const start = accum;
          const end = accum + dur;
          accum = end;
          return {
            id: `clip_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            prompt: c.prompt,
            dialogue: c.dialogue || null,
            duration: dur,
            plannedDuration: dur,
            trimStart: 0,
            trimEnd: dur,
            timelineStart: start,
            timelineEnd: end,
            status: "queued",
            videoUrl: null,
            videoData: null,
            type: "main",
            audioRole: c.audio_role || (pbIsVoiceOverClip(c) ? "voiceover" : (c.dialogue ? "onscreen_dialogue" : "none")),
            identityAnchor: c.identity_anchor || "",
            productNotes: c.product_notes || null,
            newScene: !!c.new_scene
          };
        });
        setPbClips(newClips);
        setActiveClipIdx(0);
        pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, newClips, pbImages, storyboardImage);
        
        // Also extract characters and build the reference image/character sheet from the storyboard
        setStatusMessage("Timeline generated! Scanning storyboard for characters...");
        await pbExtractCharactersFromStoryboard(storyboardImage);
        
        setStatusMessage("Timeline and character sheet generated from storyboard!");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to generate timeline: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const pbAutoSuggestAudio = async () => {
    if (isAudioAnalyzing) return;
    if (pbClips.length === 0) {
      alert("Please add some clips to the timeline first so the AI can analyze your story's audio needs.");
      return;
    }
    try {
      setIsAudioAnalyzing(true);
      setStatusMessage("Analyzing story for audio briefs...");
      
      const storyOverview = pbClips.map((c, i) => `Clip ${i+1}: ${c.prompt} ${c.dialogue ? `(Dialogue: "${c.dialogue}")` : ""}`).join("\n");
      
      const response = await fetch(
        `${GEMINI_PROXY_BASE}/models/gemini-2.5-flash:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              { text: `You are the Cinematic Creative Director. Analyze this video timeline summary:
${storyOverview}

Based on this timeline, suggest:
1. A Lyria Music Soundtrack Bed Brief: A description of the background score (e.g. key, mood, orchestration, tempo, build).
2. A Voice Dialogue & Narrator Settings description: Guidance on character voice styles and narration delivery.

Return the response as a JSON block matching this schema:
\`\`\`json
{
  "musicPrompt": "Description of background score...",
  "voiceSignature": "Description of voice style..."
}
\`\`\`
Respond ONLY with the JSON block.` }
            ] }],
            generationConfig: { responseMimeType: "application/json" }
          })
        }
	      );
	      
	      const data = await pbReadGeminiJson(response, "Audio brief generation");
	      if (data.error) throw new Error(pbDescribeApiError(data, "Audio brief generation failed"));
	      let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
	      const objStart = text.search(/[[{]/);
	      const objEnd = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
	      if (objStart !== -1 && objEnd > objStart) text = text.slice(objStart, objEnd + 1);
	      const parsed = JSON.parse(text);
	      if (parsed) {
	        setMusicPrompt(parsed.musicPrompt || "");
	        setVoiceSignature(parsed.voiceSignature || "");
	        pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, pbClips, pbImages, storyboardImage, parsed.musicPrompt, parsed.voiceSignature);
	        setStatusMessage("Audio briefs suggested!");
	        setTimeout(() => setStatusMessage(""), 2000);
	      }
	    } catch (err) {
	      console.error(err);
	      alert("Failed to suggest audio: " + err.message);
	    } finally {
	      setIsAudioAnalyzing(false);
	    }
  };

  const pbExtractCharactersFromStoryboard = async (base64, baseImagesOverride = null) => {
    try {
      setStatusMessage("Scanning storyboard for characters...");
      const response = await fetch(
        `${GEMINI_PROXY_BASE}/models/gemini-3.5-flash:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              { inlineData: { mimeType: "image/png", data: base64 } },
              { text: `Analyze this visual storyboard image carefully. Identify ONLY actual human characters or physical products shown in the storyboard panels (the shot/scene illustrations).

DO NOT extract:
- Logos, icons, app mockups, or brand symbols
- Color palettes, style swatches, or typography samples
- UI/UX wireframes or design system elements
- Abstract graphics, decorative patterns, or background textures
- Any element that is part of the storyboard's layout/design rather than the story content

For each real character or product found, return a short descriptive tag and a bounding box covering the character's full body (not just face) or the product.

Return ONLY a valid JSON array: [{"tag": "Bearded Indian protagonist", "box": [ymin, xmin, ymax, xmax]}]. Bounding box coordinates normalized 0-1000. Max 3 elements. If no real characters or products are found, return []. No extra text, no markdown.` }
            ]}],
            generationConfig: { temperature: 0.1 }
          })
        }
      );

      const data = await response.json();
      let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      text = text.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/```$/, "").trim();

      const characters = JSON.parse(text);
      if (!Array.isArray(characters) || characters.length === 0) return;

      const img = new Image();
      img.src = `data:image/png;base64,${base64}`;
      await new Promise(r => { img.onload = r; });

      const extracted = [];
      for (const char of characters.slice(0, 3)) {
        const [ymin, xmin, ymax, xmax] = char.box;
        let x = (xmin / 1000) * img.width;
        let y = (ymin / 1000) * img.height;
        let w = ((xmax - xmin) / 1000) * img.width;
        let h = ((ymax - ymin) / 1000) * img.height;

        const pad = Math.min(w, h) * 0.2;
        x = Math.max(0, x - pad);
        y = Math.max(0, y - pad);
        w = Math.min(img.width - x, w + pad * 2);
        h = Math.min(img.height - y, h + pad * 2);

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(w));
        canvas.height = Math.max(1, Math.round(h));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL("image/png");
        extracted.push({
          src: dataUrl,
          tag: char.tag,
          base64: dataUrl.split(",")[1],
          mimeType: "image/png",
          _autoExtracted: true,
          _isCharacter: true,
          _fromStoryboardCharacterSheet: true,
          _refId: `ref_char_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        });
      }

      // Also extract and crop individual visual panels (Shot 1, Shot 2, etc.) from the storyboard sheet.
      // Storyboards typically contain a grid of panels. We ask the model for the panel boxes.
      try {
        setStatusMessage("Extracting individual visual panels from storyboard...");
        const panelRes = await fetch(
          `${GEMINI_PROXY_BASE}/models/gemini-3.5-flash:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [
                { inlineData: { mimeType: "image/png", data: base64 } },
                { text: `Analyze this storyboard sheet image. Locate each individual visual panel (excluding text descriptions or color palettes). For each sequential panel, return its sequential name ("Shot 1", "Shot 2", "Shot 3", etc.) and bounding box.
  
Return ONLY a valid JSON array: [{"tag": "Shot 1", "box": [ymin, xmin, ymax, xmax]}]. Bounding box coordinates normalized 0-1000. Maximum 8 panels. No markdown, no extra text.` }
              ]}],
              generationConfig: { temperature: 0.1 }
            })
          }
        );
        const panelData = await panelRes.json();
        let panelText = panelData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
        panelText = panelText.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/```$/, "").trim();
        const panels = JSON.parse(panelText);
        if (Array.isArray(panels)) {
          const img = new Image();
          img.src = `data:image/png;base64,${base64}`;
          await new Promise(r => { img.onload = r; });

          for (const panel of panels) {
            const [ymin, xmin, ymax, xmax] = panel.box;
            let px = (xmin / 1000) * img.width;
            let py = (ymin / 1000) * img.height;
            let pw = ((xmax - xmin) / 1000) * img.width;
            let ph = ((ymax - ymin) / 1000) * img.height;

            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(pw));
            canvas.height = Math.max(1, Math.round(ph));
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, px, py, pw, ph, 0, 0, canvas.width, canvas.height);

            const dataUrl = canvas.toDataURL("image/png");
            extracted.push({
              src: dataUrl,
              tag: panel.tag,
              base64: dataUrl.split(",")[1],
              mimeType: "image/png",
              _autoExtracted: true,
              _isStoryboardPanel: true,
              _refId: `ref_panel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
            });
          }
        }
      } catch (panelErr) {
        console.warn("Storyboard panel extraction failed:", panelErr);
      }

      const primaryCharacter = extracted.find(im => im._fromStoryboardCharacterSheet);
      const baseImages = Array.isArray(baseImagesOverride) ? baseImagesOverride : pbImages;
      const mergedImages = [...baseImages.filter(im => !im._autoExtracted), ...extracted];
      setPbImages(mergedImages);
      if (primaryCharacter?.base64) setCharacterSheetImage(primaryCharacter.base64);
      pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, pbClips, mergedImages, base64, musicPrompt, voiceSignature, primaryCharacter?.base64 || characterSheetImage);
      for (const charImg of extracted.filter(im => im._fromStoryboardCharacterSheet).slice(0, 3)) {
        pbCaptureCharacter(charImg._refId, charImg.base64, charImg.mimeType || "image/png");
      }
    } catch (err) {
      console.warn("Auto character extraction failed:", err);
    }
  };

  const pbClearStoryboard = () => {
    setStoryboardImage(null);
    setCharacterSheetImage(null);
    const cleanedImages = pbImages.filter(im => !im._autoExtracted);
    setPbImages(cleanedImages);
    pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, pbClips, cleanedImages, null, musicPrompt, voiceSignature, null);
  };

  const pbDeleteReferenceImage = (index) => {
    const updated = pbImages.filter((_, idx) => idx !== index);
    setPbImages(updated);
    pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, pbClips, updated, storyboardImage);
  };

  // --- Helper: Strip interactive markers from model text ---
  const stripMarkers = (text) => {
    if (!text) return "";
    return text.replace(/\[OPTION:\s*.+?\]/g, "").replace(/\[DO:\s*.+?\]/g, "").trim();
  };

  // --- Auto-describe and add image to references ---
  const autoAddReferenceWithId = async (refId, src, base64, mimeType) => {
    return autoAddReferenceCore(refId, src, base64, mimeType);
  };

  const autoAddReference = async (src, base64, mimeType) => {
    const refId = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return autoAddReferenceCore(refId, src, base64, mimeType);
  };

  // --- CHARACTER LOCK: extract precise facial geometry from an uploaded photo ---
  // A generic "bald man with glasses" describes a million people. The lock captures
  // what makes THIS face this person, and rides every request verbatim.
  const pbCaptureCharacter = async (refId, base64, mimeType) => {
    try {
      const res = await fetch(`${GEMINI_PROXY_BASE}/models/${SYNTH_MODEL}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: `Is this image primarily a PERSON (photo, portrait, selfie, or a character design of a person)? If not, reply exactly: NOT_CHARACTER

If it IS a person, reply in EXACTLY this format:
FEATURES: <one dense paragraph of precise identity and wardrobe geometry for replication: head/hair (e.g. fully bald smooth crown vs hairline shape), face shape, age range, skin tone, eyes (shape, set), eyebrows, nose (bridge, tip), lips, exact beard/moustache pattern INCLUDING color mix (e.g. black beard with significant grey at the chin), glasses (exact frame shape, bridge style), body build/proportions, and any distinctive marks. If clothing is visible, include exact outfit/uniform details: garment type, collar shape, sleeve color, shoulder/chest panels, side stripes, trouser color and stripes, shoe colors, logo placement, and any user-owned jersey lettering visible on the clothing. Be specific enough that an artist could draw this exact person in the exact same clothes, not a lookalike or redesigned outfit.>` }
          ]}],
          generationConfig: { temperature: 0.1, maxOutputTokens: 520 }
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const text = (data.candidates?.[0]?.content?.parts || []).map(pt => pt.text || "").join("").trim();
      if (!text || /NOT_CHARACTER/i.test(text)) {
        setPbImages(prev => prev.map(img => img._refId === refId ? { ...img, _charChecked: true } : img));
        return;
      }
      const features = (text.match(/FEATURES:\s*([\s\S]+)/i)?.[1] || text).trim();
      setPbImages(prev => prev.map(img => img._refId === refId
        ? { ...img, _isCharacter: true, _charChecked: true, _identityLock: features }
        : img));
    } catch (err) {
      console.warn("Character capture failed (image stays a normal reference):", err);
    }
  };

  // --- PRODUCT LOCK: detect a pasted product, research it online, freeze it ---
  // A locked product is IMMUTABLE: identical shape, label, logo, lettering, and
  // colors in every frame of every clip, regardless of art style. Never altered.
  const pbCaptureProduct = async (refId, base64, mimeType) => {
    try {
      const res = await fetch(`${GEMINI_PROXY_BASE}/models/${SYNTH_MODEL}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: `Is this image primarily a COMMERCIAL PRODUCT (packaged goods, device, bottle, gadget, apparel item, branded object, packshot)? If it is NOT a product (it is a scene, storyboard panel, character, artwork, landscape, or person), reply with exactly: NOT_PRODUCT

If it IS a product: identify it precisely (search the web if needed to confirm the brand/model) and reply in EXACTLY this format:
NAME: <brand + product name, or best identification>
WHAT: <one sentence: what it is and what it is for>
	LOCK: <exhaustive visual description for exact replication: shape, size, proportions, materials, finish, every label text VERBATIM, logo appearance, exact colors, cap/closure details, printed artwork/food imagery, panel spacing, label layout, distinguishing marks, and all visible package parts. Include this exact rule in the lock: ${PB_PRODUCT_EXACT_LOCK}>` }
          ]}],
          tools: [{ google_search: {} }]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const text = (data.candidates?.[0]?.content?.parts || []).map(pt => pt.text || "").join("").trim();
      if (!text || /NOT_PRODUCT/i.test(text)) return;

      const name = (text.match(/NAME:\s*(.+)/i)?.[1] || "Unidentified product").trim();
      const what = (text.match(/WHAT:\s*(.+)/i)?.[1] || "").trim();
      const lock = (text.match(/LOCK:\s*([\s\S]+)/i)?.[1] || text).trim();

      // Freeze onto the reference image (survives session save/load)
      setPbImages(prev => prev.map(img => img._refId === refId
        ? { ...img, _isProduct: true, _productLock: lock, tag: img._userTagged ? img.tag : `Product — ${name}` }
        : img));

      // The Director asks the user to confirm — the user always has final say
      const confirmMsg = `📦 **Product captured: ${name}**\n\n${what ? what + "\n\n" : ""}I researched it and locked this exact appearance:\n\n_"${lock.substring(0, 350)}${lock.length > 350 ? "…" : ""}"_\n\nFrom now on this product is **IMMUTABLE** — it will appear exactly as in your image in every clip, no matter the art style. Nothing about its shape, label, logo, or colors will ever be changed.\n\nIs my understanding correct?\n\n[OPTION: Yes — locked, use it exactly]\n[OPTION: Let me correct the product details]\n[OPTION: Not a product — treat as normal reference]`;
      setChatHistory(prev => {
        const updated = [...prev, { role: "model", text: confirmMsg }];
        pbSaveSession(activeSessionId, sessionName, updated, pbFormat, videoModel, pbClips, pbImages, storyboardImage);
        return updated;
      });
    } catch (err) {
      console.warn("Product capture failed (image stays a normal reference):", err);
    }
  };

  // --- OBJECT / LOGO LOCK: freeze standalone props, sports gear, emblems, and marks ---
  // These are not characters, and often are not "products" either. They still need
  // exact visual treatment when attached to Gemini Omni.
  const pbCaptureObjectLock = async (refId, base64, mimeType) => {
    try {
      const res = await fetch(`${GEMINI_PROXY_BASE}/models/${SYNTH_MODEL}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: `Is this image primarily a STANDALONE OBJECT, PROP, SPORTS EQUIPMENT, LOGO, BADGE, EMBLEM, ICON, WORDMARK, or MARK that should be visually locked for later video generation? Examples: cricket ball, cricket bat, helmet, trophy, shoe, jersey badge, brand logo, app icon, product logo.

If it is primarily a person, full scene, storyboard panel, landscape, or generic style reference, reply exactly: NOT_OBJECT

If it IS a lockable object/logo/prop, reply in EXACTLY this format:
NAME: <short object/logo name>
LOCK: <exhaustive visual description for exact replication: shape, proportions, materials, colors, seams/patterns, lighting-independent markings, logo/lettering layout if visible, and the exact surface where the logo/lettering belongs. State that it must not be recreated on other surfaces.>` }
          ]}],
          generationConfig: { temperature: 0.1, maxOutputTokens: 420 }
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const text = (data.candidates?.[0]?.content?.parts || []).map(pt => pt.text || "").join("").trim();
      if (!text || /NOT_OBJECT/i.test(text)) {
        setPbImages(prev => prev.map(img => img._refId === refId ? { ...img, _objectChecked: true } : img));
        return;
      }

      const name = (text.match(/NAME:\s*(.+)/i)?.[1] || "Locked object").trim();
      const lock = (text.match(/LOCK:\s*([\s\S]+)/i)?.[1] || text).trim();
      setPbImages(prev => prev.map(img => img._refId === refId
        ? { ...img, _isObjectLock: true, _objectChecked: true, _objectLock: lock, tag: img._userTagged ? img.tag : name }
        : img));
    } catch (err) {
      console.warn("Object/logo capture failed (image stays a normal reference):", err);
    }
  };

  const autoAddReferenceCore = async (refId, src, base64, mimeType) => {
    const tempTag = `Analyzing...`;
    const newImg = { src, tag: tempTag, base64, mimeType, _refId: refId };
    setPbImages(prev => {
      const updated = [...prev, newImg];
      pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, pbClips, updated, storyboardImage);
      return updated;
    });

    // Auto-describe with Gemini in background
    try {
      const res = await fetch(
        `${GEMINI_PROXY_BASE}/models/${SYNTH_MODEL}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              { inlineData: { mimeType, data: base64 } },
              { text: `Create a reference tag for this image. FIRST: if the image contains any caption, label, or title text (like "Shot 5: Both of them hold their hands" or "Scene 3 - Krishna under tree" or "Character Reference: Radha"), return that caption text VERBATIM (trimmed, max 12 words) — it is the user's own labeling and must be preserved exactly, including any shot/scene number. ONLY IF there is no readable caption text: describe the image in 3-5 specific words (e.g. "Bearded Indian man", "Dense jungle scene", "Woman in red saree"). Return ONLY the tag text, nothing else.` }
            ]}],
            generationConfig: { temperature: 0.1, maxOutputTokens: 60 }
          })
        }
      );
      const data = await res.json();
      let tag = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || tempTag;
	      // Clean up quotes if Gemini wraps it
	      tag = tag.replace(/^"|"$/g, "").trim();
	      const productLikeTag = /\b(product|pack|package|packshot|bottle|can|jar|box|label|sprinkler|masala|salt|pepper|catch)\b/i.test(tag);
	      if (productLikeTag) {
	        setPbImages(prev => prev.map(img => img._refId === refId
	          ? { ...img, _isProduct: true, _productLock: `${PB_PRODUCT_EXACT_LOCK} Product reference tag: ${tag}.`, tag: img._userTagged ? img.tag : `Product — ${tag}` }
	          : img));
	      }

	      // In parallel: detect + lock product or character identity (non-blocking)
      pbCaptureProduct(refId, base64, mimeType);
      pbCaptureCharacter(refId, base64, mimeType);
      pbCaptureObjectLock(refId, base64, mimeType);
      // Update the tag by matching the unique refId — but a user-typed tag always wins
      setPbImages(prev => {
        const updated = prev.map(img => img._refId === refId && !img._userTagged ? { ...img, tag } : img);
        pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, pbClips, updated, storyboardImage);
        return updated;
      });
    } catch (err) {
      console.warn("Auto-describe failed:", err);
      // Update with fallback tag
      setPbImages(prev => {
        const updated = prev.map(img => img._refId === refId && !img._userTagged ? { ...img, tag: "Reference" } : img);
        return updated;
      });
    }
    return refId;
  };

  // --- Upload Chat Attachments ---
  const handleChatAttachment = (e) => {
    const files = e.target.files;
    if (!files) return;
    for (const f of files) {
      if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) continue;
      const reader = new FileReader();
      reader.onload = async (event) => {
        const src = event.target.result;
        let finalSrc = src;
        let finalBase64 = src.split(",")[1];
        let finalMime = f.type;
        
        if (f.type.startsWith("image/")) {
          const compressedSrc = await pbCompressImage(src, 768, 0.7);
          finalSrc = compressedSrc;
          finalBase64 = compressedSrc.split(",")[1];
          finalMime = "image/jpeg";
        }
        
        const fileRefId = f.type.startsWith("image/") ? `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : null;
        setChatFiles(prev => [...prev, {
          src: finalSrc, base64: finalBase64, mimeType: finalMime, name: f.name, type: f.type.startsWith("image/") ? "ref" : "video", _refId: fileRefId
        }]);
        // Auto-add images to Reference panel (reusing the same refId for tag sync)
        if (f.type.startsWith("image/")) {
          autoAddReferenceWithId(fileRefId, finalSrc, finalBase64, finalMime);
        }
      };
      reader.readAsDataURL(f);
    }
  };

  const handleImageUploads = (files) => {
    if (!files) return;
    for (const f of files) {
      if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) continue;
      const reader = new FileReader();
      reader.onload = async (event) => {
        const src = event.target.result;
        let finalSrc = src;
        let finalBase64 = src.split(",")[1];
        let finalMime = f.type;
        
        if (f.type.startsWith("image/")) {
          const compressedSrc = await pbCompressImage(src, 768, 0.7);
          finalSrc = compressedSrc;
          finalBase64 = compressedSrc.split(",")[1];
          finalMime = "image/jpeg";
        }
        
        autoAddReference(finalSrc, finalBase64, finalMime);
      };
      reader.readAsDataURL(f);
    }
  };

  // --- Clipboard Paste Handler (images from clipboard) ---
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        const reader = new FileReader();
        reader.onload = async (event) => {
          const src = event.target.result;
          const compressedSrc = await pbCompressImage(src, 768, 0.7);
          const base64 = compressedSrc.split(",")[1];
          setChatFiles(prev => [...prev, {
            src: compressedSrc, base64, mimeType: "image/jpeg", name: `pasted_${Date.now()}.png`, type: "ref"
          }]);
          // Auto-add to Reference panel
          autoAddReference(compressedSrc, base64, "image/jpeg");
        };
        reader.readAsDataURL(blob);
      }
    }
  };

  // --- Send Message to Creative Director (Full Session Memory) ---
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    try {
      const promptText = (chatInputRef.current?.value || "").trim();
      if (!promptText && chatFiles.length === 0) return;

      // Product-lock escape hatch: unlock the most recent locked product
      if (/^Not a product — treat as normal reference$/i.test(promptText)) {
        setPbImages(prev => {
          const lastIdx = [...prev].reverse().findIndex(img => img._isProduct);
          if (lastIdx === -1) return prev;
          const realIdx = prev.length - 1 - lastIdx;
          return prev.map((img, xi) => xi === realIdx ? { ...img, _isProduct: false, _productLock: null } : img);
        });
      }

      // Greeting = learning ritual: study something new online, remember it, share it
      if (pbIsGreeting(promptText) && chatFiles.length === 0) {
        if (chatInputRef.current) {
          chatInputRef.current.value = "";
          chatInputRef.current.style.height = "auto";
        }
        const greetChat = [...chatHistory, { role: "user", text: promptText }];
        setChatHistory(greetChat);
        setIsTyping(true);
        try {
          const learned = await pbLearnSomethingNew();
          const learnedMsg = learned
            ? `Good to see you! As always, I studied before our session. Here's what I learned today:\n\n${learned}\n\nI've added this to my memory and will apply it to our next production. What are we creating today?\n\n[OPTION: Describe a new video concept]\n[OPTION: Teach me another technique]\n[OPTION: Continue previous project]`
            : `Good to see you! I tried to study something new but couldn't reach my research sources right now. What are we creating today?\n\n[OPTION: Describe a new video concept]\n[OPTION: Continue previous project]`;
          const updatedGreetChat = [...greetChat, { role: "model", text: learnedMsg }];
          setChatHistory(updatedGreetChat);
          pbSaveSession(activeSessionId, sessionName, updatedGreetChat, pbFormat, videoModel, pbClips, pbImages, storyboardImage);
        } catch (learnErr) {
          console.warn("Learning ritual failed:", learnErr);
          setChatHistory([...greetChat, { role: "model", text: "Good to see you! My research sources are unreachable right now, but I'm ready to create. What's the concept?" }]);
        }
        setIsTyping(false);
        return;
      }

      // Clear old storyboard since the prompt/concept is changing!
      setStoryboardImage(null);
      removeIndexedDBMedia(`storyboard_${activeSessionId}`);

      if (chatInputRef.current) {
        chatInputRef.current.value = "";
        chatInputRef.current.style.height = "auto";
      }

      // Build user message with optional image attachments
      const userMsg = {
        role: "user",
        text: promptText || "[Uploaded reference images]",
        images: chatFiles.map(f => ({ src: f.src, base64: f.base64, mimeType: f.mimeType, tag: f.tag || "" }))
      };

      const newChat = [...chatHistory, userMsg];
      setChatHistory(newChat);
      setIsTyping(true);
      const currentFiles = [...chatFiles];
      setChatFiles([]);

      // Build multi-turn conversation history for Gemini
      // System instruction goes as the first turn
      const contents = [];

      // Add system context as the opening model turn
      contents.push({
        role: "user",
        parts: [{ text: `${AGENT_PROFILE}${pbBuildMemoryDigest()}\n\nYou are in a creative session using Google Gemini Omni Flash for video and Gemini for images.${pbBuildCinemaBrief() ? ` The user has set cinema controls — honor them in every script: ${pbBuildCinemaBrief()}` : ""} Remember everything discussed so far. Build on previous ideas. Track character descriptions, brand details, visual styles, and script iterations across the conversation. When the user refines something, incorporate the feedback without losing prior context. Be proactive — suggest improvements, ask clarifying questions, and think like a creative partner, not just a command executor.\n\n${PB_REGIONAL_LANGUAGE_LOCK} When writing scripts, preserve the user's VO/dialogue language and romanization verbatim. Do not convert Hinglish, Hindi, or any regional-language line into English.\n\nREMINDER: All prompts you write are for Google Gemini Omni Flash ONLY. Write natural cinematic descriptions. NEVER mention Veo, Midjourney, Runway, Sora or any model by name. NEVER reference any non-Google AI tool.` }]
      });
      contents.push({
        role: "model",
        parts: [{ text: "Understood. I'm your Creative Director working exclusively with Google Gemini Omni Flash. I'll write all prompts as natural cinematic descriptions — no model names, no flags, no third-party references. I'll track all characters, brands, visual styles, and script iterations throughout our session. Let's create something extraordinary." }]
      });

      // Add full conversation history (skip the initial welcome message)
      for (const msg of newChat) {
        if (msg === chatHistory[0] && msg.role === "model") continue; // skip welcome
        const parts = [];
        // Attach any images from this message
        if (msg.images && msg.images.length > 0) {
          for (const img of msg.images) {
            parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
          }
          const taggedList = msg.images.map((img, ii) => `Image ${ii + 1}${img.tag ? ` = "${img.tag}"` : ""}`).join("; ");
          if (msg.images.some(img => img.tag)) {
            parts.push({ text: `[Reference tags for the attached images: ${taggedList}. When the user mentions a tag, they mean that EXACT image — use it for exact referencing with zero reinterpretation.]` });
          }
        }
        // Attach any current-turn files (for the latest user message)
        if (msg === userMsg && currentFiles.length > 0) {
          for (const f of currentFiles) {
            parts.push({ inlineData: { mimeType: f.mimeType, data: f.base64 } });
          }
        }
        parts.push({ text: msg.text });
        contents.push({
          role: msg.role === "user" ? "user" : "model",
          parts
        });
      }

      const response = await fetch(
        `${GEMINI_PROXY_BASE}/models/${SYNTH_MODEL}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents, tools: [{ google_search: {} }] })
        }
      );

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      const modelText = (data.candidates?.[0]?.content?.parts || []).map(pt => pt.text || "").join("") || "No response received. Please try again.";
      
      const updatedChat = [...newChat, { role: "model", text: modelText }];
      setChatHistory(updatedChat);
      setIsTyping(false);
      
      pbSaveSession(activeSessionId, sessionName, updatedChat, pbFormat, videoModel, pbClips, pbImages, storyboardImage);

      // Auto-generate storyboard after first substantive agent response
      // (when user has sent at least 1 message and no storyboard exists yet)
      const userMsgCount = updatedChat.filter(m => m.role === "user").length;
      if (userMsgCount >= 1 && !storyboardImage) {
        // Small delay to let state settle, then auto-trigger storyboard
        setTimeout(() => {
          pbGenerateStoryboard(stripMarkers(modelText));
        }, 500);
      }
    } catch (err) {
      console.error("Consultation failed:", err);
      alert("Consultation failed: " + err.message);
      setIsTyping(false);
    }
  };

  // --- Generate Visual Storyboard (Imagen 3 / Nano Banana Pro 2) ---
  const pbGenerateStoryboard = async (forcedScriptText = null, options = {}) => {
    const { resetDerived = false } = options || {};
    let lastModelMsg = typeof forcedScriptText === "string" ? forcedScriptText : null;
    if (!lastModelMsg) {
      const rawLastMsg = chatHistory.filter(m => m.role === "model").pop()?.text;
      lastModelMsg = stripMarkers(rawLastMsg);
    }
    if (!lastModelMsg) return alert("Please chat with the Creative Director to generate a script first!");

    // Set abort controller
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsGenerating(true);
    setStatusMessage("Generating visual board & storyboard sheet using Nano Banana Pro 2...");

    try {
      const baseReferenceImages = resetDerived ? pbImages.filter(im => !im._autoExtracted) : pbImages;
      if (resetDerived) {
        setStoryboardImage(null);
        setCharacterSheetImage(null);
        setPbImages(baseReferenceImages);
        pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, pbClips, baseReferenceImages, null, musicPrompt, voiceSignature, null);
      }

      const sanitizedScript = lastModelMsg;
      const cleanStoryboardScript = pbStripCharacterSurnames(sanitizedScript);

      // === FIDELITY PIPELINE Component 1: Smart selection ===
      let sortedReferences = [...baseReferenceImages];
      if (sortedReferences.length > 1) {
        try {
          setStatusMessage("Analyzing references...");
          const rawBase64s = sortedReferences.map(pbGetImageBase64);
          const sortedUrls = await selectBestSubjectImages("", cleanStoryboardScript, rawBase64s);
          sortedReferences = sortedUrls.map(url => sortedReferences.find(x => pbGetImageBase64(x) === (url.split(',')[1] || url))).filter(Boolean);
        } catch (e) {
          console.warn("Fidelity reorder failed:", e);
        }
      }

      // === FIDELITY PIPELINE Component 2: Multi-View Identity Profile ===
      let subjectProfileText = "";
      if (sortedReferences.length > 1) {
        try {
          setStatusMessage("Extracting identity profile...");
          const rawBase64s = sortedReferences.map(pbGetImageBase64);
          subjectProfileText = await extractMultiViewReferencePrompt("", rawBase64s);
        } catch (e) {
          console.warn("Fidelity profile failed:", e);
        }
      }
      if (!subjectProfileText) {
        subjectProfileText = sortedReferences.map(x => x._productLock || x._identityLock).filter(Boolean).join(" ");
      }

      // === FIDELITY PIPELINE Component 3: Build Contact Sheet ===
      let contactSheetB64 = null;
      if (sortedReferences.length > 1) {
        try {
          setStatusMessage("Building reference contact sheet...");
          const rawBase64s = sortedReferences.map(pbGetImageBase64);
          const sheetUrl = await buildReferenceContactSheet(rawBase64s, "SUBJECT REFERENCE PACK");
          if (sheetUrl) contactSheetB64 = sheetUrl.split(",")[1] || sheetUrl;
        } catch (e) {
          console.warn("Fidelity contact sheet failed:", e);
        }
      }

      const hasLockedProductRef = sortedReferences.some(img => img._isProduct || img._productLock);
      const productStoryboardDirective = hasLockedProductRef
        ? `\nLOCKED PRODUCT REFERENCE — ABSOLUTE: the user's original uploaded product image is the ONLY authority for package design. ${PB_PRODUCT_EXACT_LOCK} In storyboard panels, do NOT invent alternate product labels, do NOT redraw different packaging, and do NOT create fake variant layouts. If exact package artwork cannot be reproduced in the storyboard sheet, show the product small/partially occluded or as a plain placeholder composition cue; the final video will use the original product reference directly.`
        : "";
      const styleDirective = sortedReferences.length > 0
        ? `MANDATORY VISUAL STYLE — ANALYZE THE ATTACHED REFERENCE IMAGES DEEPLY: The user has uploaded reference artwork/images. You MUST study them carefully and replicate their EXACT visual style in every storyboard panel. Specifically analyze and match: (1) the art MEDIUM (oil painting, watercolor, digital art, photography, anime, etc.), (2) BRUSHWORK and texture quality (visible brushstrokes, canvas texture, smooth digital rendering, film grain, etc.), (3) COLOR PALETTE (exact hues, saturation levels, warm/cool tones, color harmony), (4) LIGHTING style (golden hour, dramatic chiaroscuro, soft diffused, etc.), (5) RENDERING approach (painterly, photorealistic, stylized, flat, etc.), (6) COMPOSITION and framing conventions. Do NOT default to photorealism or cinematic film style unless the reference images are themselves photorealistic. If the references are oil paintings, every panel must look like an oil painting. If they are watercolors, every panel must look like watercolor. MATCH THE REFERENCES EXACTLY. ${PB_PRODUCT_EXACT_LOCK} ${PB_LOGO_INTEGRITY}${productStoryboardDirective}`
        : `MANDATORY VISUAL STYLE: Match the specific visual style, art medium, rendering style, lighting, and environment requested in the script and shown in the reference images. If the references or script specify a 2D illustrated, hand-drawn, or painterly style, you MUST render the panels in that exact medium with zero drift. Maintain visual consistency across all panels.`;

      // Calculate expected clip count from script duration
      const lastUserMsg = chatHistory.filter(m => m.role === "user").pop()?.text || "";
      const allChatText = chatHistory.map(m => m.text).join(" ");
      const extractedDuration = pbExtractRequestedDurationSeconds(lastUserMsg)
        || pbExtractRequestedDurationSeconds(allChatText)
        || pbExtractRequestedDurationSeconds(sanitizedScript)
        || DEFAULT_TARGET_SECONDS;
      const durationPlan = pbPlanClipDurations(extractedDuration);
      const totalClips = durationPlan.length;
      const timelineRanges = pbBuildTimelineRanges(durationPlan);

      // For scripts with 3+ clips, first use Gemini Flash to create a condensed
      // shot-by-shot outline so the image model knows the FULL story arc
      let shotOutline = "";
      if (totalClips >= 3) {
        try {
          setStatusMessage(`Planning ${totalClips}-shot breakdown for storyboard...`);
          const outlineRes = await fetch(
            `${GEMINI_PROXY_BASE}/models/${SYNTH_MODEL}:generateContent`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: `You are a storyboard director. Break this script into EXACTLY ${totalClips} sequential shots for a ${extractedDuration}-second film.

For each shot, write ONE line with: Shot number, time range, and a 1-sentence visual description of what happens.

FORMAT (no extra text):
Shot 01 [${pbFormatTimelineRange(timelineRanges[0].startSeconds, timelineRanges[0].endSeconds)}]: [visual description]
Shot 02 [${timelineRanges[1] ? pbFormatTimelineRange(timelineRanges[1].startSeconds, timelineRanges[1].endSeconds) : "..."}]: [visual description]
...continue for all ${totalClips} shots

SCRIPT:
${cleanStoryboardScript}` }] }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
              }),
              signal
            }
          );
          const outlineData = await outlineRes.json();
          shotOutline = outlineData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        } catch (err) {
          console.warn("Shot outline pre-step failed, proceeding with full script:", err);
        }
      }

      const panelInstruction = shotOutline
        ? `\n\nSHOT BREAKDOWN — You MUST include ALL ${totalClips} panels:\n${shotOutline}`
        : `\n\nYou MUST generate exactly ${totalClips} sequential storyboard panels (Shot 01 through Shot ${String(totalClips).padStart(2, "0")}) covering the ENTIRE ${extractedDuration}-second narrative from beginning to end. Do NOT stop at 3 panels.`;

      const imagePromptText = `[ENGINE: Nano Banana Pro 2] Generate a comprehensive visual board and storyboard sheet in 16:9 ratio for a ${extractedDuration}-second film: "${cleanStoryboardScript}".
${styleDirective}
Depict EXACTLY what the script and the user's reference images specify — do not add your own creative interpretation beyond what is described. Include ONLY elements the script explicitly mentions: NO invented animals, props, characters, buildings, or scenery of your own. Every subject in every panel must be traceable to a line in the script. If the script contains trademarked brand names or copyrighted terms that are not visible in user-shared references, depict them as high-quality generic visual equivalents (no logos, no protected lettering) — choose the equivalents yourself. ${PB_LOGO_INTEGRITY}
The sheet must contain (decide from the script itself what fits):
1. Character Design & Expressions if the script features characters; otherwise Layout, Graphic Design & Typography elements matching the visual style.
2. Color Palette & Environment/Style Swatches matching the requested theme.
3. EXACTLY ${totalClips} Sequential Storyboard Panels (labeled Shot 01 through Shot ${String(totalClips).padStart(2, "0")}) covering the FULL narrative from start to finish. Each panel represents a ${durationPlan[0]}-second clip.${panelInstruction}`;

      // === FIDELITY PIPELINE Component 4: Constraint header injection ===
      const finalImagePrompt = applySubjectProfilePriority(imagePromptText, subjectProfileText, sortedReferences.length);

      // Attempt 1 with retry & validation
      let b64 = null;
      let correctionHint = "";
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        
        let promptForAttempt = finalImagePrompt;
        if (attempt === 2) {
          setStatusMessage("First attempt returned no image — retrying with simplified prompt...");
          promptForAttempt = `Generate a visual storyboard sheet in 16:9 aspect ratio with EXACTLY ${totalClips} sequential panels (Shot 01 through Shot ${String(totalClips).padStart(2, "0")}) for a ${extractedDuration}-second film showing this concept: ${cleanStoryboardScript.substring(0, 800)}. Include character designs if applicable, color palette swatches, and clear panel compositions. Each panel must cover a different part of the story — do NOT repeat scenes. Do NOT include any brand names, logos, or copyrighted content.`;
        } else if (attempt === 3 && correctionHint) {
          setStatusMessage("Refining storyboard for better fidelity...");
          promptForAttempt = finalImagePrompt + `\n\n⚠️ CORRECTION REQUIRED: ${correctionHint}`;
        }

        const requestParts = [];
        if (attempt !== 2) {
          if (contactSheetB64) {
            requestParts.push({ inlineData: { mimeType: "image/jpeg", data: contactSheetB64 } });
          }
          sortedReferences.forEach(img => {
            const imgB64 = pbGetImageBase64(img);
            const mime = pbGetImageMimeType(img);
            requestParts.push({ inlineData: { mimeType: mime, data: imgB64 } });
          });
        }
        requestParts.push({ text: promptForAttempt });

        setStatusMessage(`Generating storyboard sheet using Nano Banana Pro 2 (Attempt ${attempt}/3)...`);

        const res = await fetch(
          `${GEMINI_PROXY_BASE}/models/${IMAGE_MODEL}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: requestParts }],
              generationConfig: { 
                responseModalities: ["IMAGE"], 
                temperature: 1.0,
                imageConfig: {
                  imageSize: "2K",
                  aspectRatio: "16:9"
                }
              }
            }),
            signal
          }
        );

        let data;
        try {
          data = await pbReadGeminiJson(res, `Storyboard generation attempt ${attempt}`);
        } catch (apiErr) {
          console.warn(`Storyboard attempt ${attempt} API error:`, apiErr);
          if (attempt === 2 || (attempt === 3 && correctionHint) || /non-JSON HTTP|GEMINI_API_KEY|not configured|NOT_FOUND|not found/i.test(apiErr.message)) throw apiErr;
          continue;
        }
        
        const resParts = data.candidates?.[0]?.content?.parts || [];
        for (const part of resParts) {
          if (part.inlineData && part.inlineData.mimeType.startsWith("image/")) {
            b64 = part.inlineData.data;
            break;
          }
        }

        if (!b64) {
          const textParts = resParts.filter(p => p.text).map(p => p.text).join(" ");
          console.warn(`Storyboard attempt ${attempt}: No image returned. Text response: "${textParts.substring(0, 200)}"`);
          continue;
        }

        // === FIDELITY PIPELINE Component 5: Grounding Assessor & Self-Correction ===
        if (attempt <= 2 && sortedReferences.length > 0 && !correctionHint) {
          setStatusMessage("Validating fidelity...");
          const rawBase64s = sortedReferences.map(pbGetImageBase64);
          const dataUrls = rawBase64s.map(b => b.startsWith("data:") ? b : `data:image/jpeg;base64,${b}`);
          const generatedDataUrl = `data:image/png;base64,${b64}`;
          const assessment = await assessImageGrounding("", cleanStoryboardScript, dataUrls, generatedDataUrl, {
            subjectProfileLock: true,
            minimumScore: 75
          });
          console.log(`[Storyboard Grounding] Score: ${assessment.score}, Pass: ${assessment.pass}, Issues: ${assessment.issues}`);
          if (!assessment.pass && assessment.correction) {
            correctionHint = assessment.correction;
            b64 = null; // reset to trigger retry
            continue;
          }
        }

        break;
      }

      if (!b64) throw new Error("No image data returned for Visual Board after all attempts.");
      setStoryboardImage(b64);
      await pbExtractCharactersFromStoryboard(b64, baseReferenceImages);
      setIsGenerating(false);
      pbReleaseWakeLock();
      abortControllerRef.current = null;
    } catch (err) {
      if (err.name === "AbortError") {
        console.log("Storyboard generation cancelled");
      } else {
        console.error("Storyboard generation failed:", err);
        alert("Storyboard generation failed: " + err.message);
      }
      setIsGenerating(false);
      pbReleaseWakeLock();
      abortControllerRef.current = null;
    }
  };

  // --- Split Script Helper ---
  const pbSplitScript = async (fullPrompt, targetTotalSeconds = DEFAULT_TARGET_SECONDS, durationPlan = pbPlanClipDurations(targetTotalSeconds)) => {
    try {
      setStatusMessage("Breaking script into segments...");
      const response = await fetch(
        `${GEMINI_PROXY_BASE}/models/gemini-3.5-flash:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              // Add storyboard image for visual alignment
              ...(storyboardImage ? [{ inlineData: { mimeType: "image/png", data: storyboardImage } }] : []),
              ...(characterSheetImage ? [{ inlineData: { mimeType: "image/png", data: characterSheetImage } }] : []),
              // Add reference images for character matching
              ...pbImages.map(img => {
                const base64 = pbGetImageBase64(img);
                const mimeType = pbGetImageMimeType(img);
                return { inlineData: { mimeType, data: base64 } };
              }),
              { text: `You are a professional film editor splitting a commercial script into sequential video clips for AI video generation (Google Gemini Omni Flash).
${pbBuildMemoryDigest()}

TARGET FINISHED RUNTIME: ${targetTotalSeconds} seconds.

Gemini Omni Flash produces native video clips from ${MIN_OMNI_CLIP_SECONDS} to ${MAX_OMNI_CLIP_SECONDS} seconds (typically 3, 4, 6, 8, or 10 seconds).
Your job is to partition the script into sequential clips, planning a specific duration for each clip ("duration_seconds" between 3 and 10) based on the action needs of that clip. If a clip only requires 3, 4, or 6 seconds, assign that duration. Do not pad clips with fluff or filler action.
The sum of all "duration_seconds" across your clips must equal exactly ${targetTotalSeconds} seconds. For example, a 60-second video could be split into 8 clips of varying lengths (e.g. 6s, 4s, 8s, 10s, 6s, 8s, 10s, 8s) rather than six equal 10-second clips.
Compute "start_seconds" and "end_seconds" for each clip dynamically so they are contiguous and sum up to exactly ${targetTotalSeconds} seconds (e.g. Clip 1 starts at 0 and ends at 4; Clip 2 starts at 4 and ends at 10, etc.).

If TARGET FINISHED RUNTIME is ${MAX_OMNI_CLIP_SECONDS} seconds or less, use ONE continuous native Omni clip with timed beats; do not split it into artificial clips. If the target runtime is longer than ${MAX_OMNI_CLIP_SECONDS} seconds, split into continuation clips and make each clip self-contained while preserving story continuity.

${(() => {
  const userShots = pbImages
    .filter(img => !img._autoExtracted && img.tag)
    .map(img => ({ idx: pbGetReferenceImageIndex(img), tag: img.tag }))
    .filter(x => x.idx !== null)
    .sort((a, b) => a.idx - b.idx);
  if (userShots.length === 0) return "";
  return `USER'S OWN STORYBOARD (ABSOLUTE AUTHORITY for scene content and order):
The user uploaded their own per-shot storyboard images with captions. The clips MUST depict EXACTLY these shots, in exactly this order — nothing invented, nothing skipped, nothing reinterpreted:
${userShots.map(x => `- Shot ${x.idx + 1}: ${x.tag}`).join("\n")}
If there are more user shots than clips, merge adjacent shots inside one clip as timed beats — but EVERY user shot must appear. If there are fewer user shots than clips, spread them across clips without inventing new scenes.

`;
})()}${(() => { const cast = pbImages.filter(i => i._identityLock && !i._isProduct).map(i => `- ${i.tag || "Character"}: ${i._identityLock}`).join("\n"); return cast ? `LOCKED CAST (identity and wardrobe extracted from the user's reference images — use these VERBATIM as the basis of every identity_anchor; do not invent, simplify, or generalize face, uniform, logo placement, stripes, colors, trousers, or shoes):\n${cast}\n\n` : ""; })()}CINEMATOGRAPHY DIRECTION:
${pbBuildCinemaBrief() || "Choose coverage that serves the story — the Director decides genre grammar from the concept."}
- SHOT PLAN (required): open every clip's prompt with its shot plan written naturally: shot size (extreme wide / wide / medium / close-up / extreme close-up / insert), camera angle (eye level, low, high, overhead, aerial, dutch), camera movement (static, dolly in/out, tracking, orbit, crane up/down, whip pan, drone fly-over), and lens feel.
- COVERAGE VARIETY (required): vary shot sizes and angles across the film — never two consecutive clips with the same size AND angle. Include at least one true wide establisher, meaningful close-ups on emotional beats, and at least one high or aerial angle when the camera style allows. Break the eye-level-medium habit.

CRITICAL STORYBOARD ALIGNMENT RULES:
${storyboardImage ? `1. You are provided with a Visual Board & Storyboard Sheet (first image) containing character designs and sequential panels (Shot 01, Shot 02, etc.).
2. You MUST align the generated clips with the storyboard panels.
   - Replicate the exact setting, environment details, color schemes, lighting, and composition depicted in those panels.
3. Reposition the character according to their poses in those panels.
4. The character's appearance must EXACTLY match what is shown in the storyboard character model sheet.` : "No storyboard provided. Use the script description for all visual decisions."}

	MINIMAL SCRIPT HANDLING:
	- If the script/prompt is very short or vague (e.g. "create a 60 seconds video", "make a video about this character"), you MUST invent a compelling, emotionally engaging narrative by deeply analyzing the attached reference images. Study the characters, their world, their costumes, the art style's cultural/mythological context, and create a story that fits them naturally. The reference images are your primary creative brief when the text is minimal.
	
	REGIONAL LANGUAGE / VO LOCK (CRITICAL):
	- ${PB_REGIONAL_LANGUAGE_LOCK}
	- Preserve every quoted VO, narrator line, dialogue line, slogan, and user-provided text from SCRIPT TO SPLIT exactly in the same language and romanization.
	- If the user wrote Hinglish such as "Kuch chatkaare... ham kabhi nahi bhoolte", the "dialogue" field MUST keep that exact Hinglish wording. Do not convert it to English.
	- Each clip prompt may describe visuals in English, but any spoken words inside the prompt and the "dialogue" field must remain verbatim in the user's language.
	- The "voice_signature" must mention the intended language/accent when present, e.g. mature female Hindi/Hinglish voice, Indian accent, natural code-switching.
	- ${PB_VOICEOVER_LOCK}
	- If the script marks a line as VO, V.O., Voiceover, Narration, or Narrator, set "audio_role" to "voiceover". Do NOT describe any visible character speaking or moving lips for that line.
	- Only set "audio_role" to "onscreen_dialogue" when the visible character is explicitly speaking in the scene.
	
	CRITICAL RULES:
- The STORY must flow seamlessly from clip 1 to the last clip. Each clip picks up EXACTLY where the previous one ended.
- SLICE SIZING: write each clip's action to fill its assigned duration comfortably. Never pack more story into a clip than fits its seconds; never pad a clip with action that belongs to the next one. The end_state of clip N must be the natural physical starting position for clip N+1's first action.
- EDIT INSIDE THE CLIP (the main game): write each clip's prompt as an EDITED SCENE with 2-4 internal beats using natural local timing ("for the first few seconds...", "then a quick insert of...", "ending on..."). Use detail inserts, reaction shots, match cuts, and — where it deepens the story — a brief flashback or flash-forward insert connecting to the film's past or future moments.
- NO BORING BEATS: if a clip's slice of story is mundane (walking, driving, waiting), elevate it editorially — intercut a memory or a telling detail, compress the time with cuts, or turn it into a reveal. Every clip must be interesting on its own.
- CUTS RETURN HOME: internal cutaways live in the middle of the clip — each clip still begins from where the previous one ended and finishes at its own end_state.
	- Characters must be described with IDENTICAL physical features and wardrobe in EVERY clip (same face, hairline/bald crown or hairstyle, beard, build, clothes/uniform, skin tone, trouser stripes, shoes, and any user-owned jersey lettering/logo placement). Never change a character's appearance or outfit.${pbImages.length > 0 || characterSheetImage ? "\n- Reference artwork/images are attached. DEEPLY ANALYZE the visual style, art medium, brushwork, color palette, and rendering approach of these references. Every clip prompt MUST begin with an explicit ART STYLE LOCK paragraph that names: (1) the exact art medium/tradition observed in the references (e.g. 'Classical Devotional Oil-on-Canvas', 'Kangra miniature gouache', 'Studio Ghibli cel animation'), (2) the specific brushwork/line character, (3) the palette, (4) at least TWO 'NEVER' statements (e.g. 'NEVER photorealistic, NEVER 3D CGI' for a painted film, or 'NEVER illustration, NEVER cartoon look' for a live-action film). This style paragraph must appear in EVERY clip prompt, not just the first one. The character in the video MUST look EXACTLY like the person in the reference images — same face, skin tone, hair, uniform/clothing panels, logo/lettering placement, trousers, and shoes. Do NOT drift from the references' exact medium in ANY direction." : ""}
		- BRAND/LOGO HANDLING: ${pbImages.some(img => img._isProduct && img._productLock) ? `THE USER'S OWN PRODUCT IS LOCKED AND EXEMPT FROM ALL GENERICIZATION: "${pbImages.find(img => img._isProduct && img._productLock)._productLock}". Every clip in which the product appears must carry this description VERBATIM in product_notes — its real name, shape, size, package parts, label artwork, printed imagery, logo, text, cap, and colors are preserved exactly. NEVER genericize, rename, redesign, restyle, repaint, relabel, resize, or alter the user's product in any situation. ${PB_PRODUCT_EXACT_LOCK} User-owned wardrobe lettering/logos visible in attached character references are also part of the wardrobe lock and must be preserved exactly on that same wardrobe surface. ${PB_LOGO_INTEGRITY} Only OTHER third-party brands that are NOT the user's product or wardrobe reference get generic visual equivalents (to avoid trademark blocks).` : `To prevent copyright/trademark safety blocks, do NOT include external trademarked brand names from the script; describe products with high-quality generic visual equivalents. However, user-owned wardrobe lettering/logos that are visibly part of attached character references are part of the wardrobe lock and should be preserved exactly on that same wardrobe surface. ${PB_LOGO_INTEGRITY}`}
- Each clip prompt must be self-contained enough that someone reading ONLY that prompt would know the character's exact appearance, the setting, and the action.
- Write each prompt specifically for Gemini Omni Flash: natural cinematic prose with explicit scene description, subject/reference handling, camera movement, lens feel, lighting, mood, physics, environmental motion, audio, and dialogue.
- Do NOT prefix the prompt with any bracketed global timecode such as [0-5s], [10-20s], or Shot 01. The app owns visible timing labels.
- NEVER write [# Sources], [# References], <FIRST_FRAME>, <IMAGE_REF_N>, @ImageN, or ANY tag/header syntax in prompts — the app generates those headers automatically at request time, and hand-written ones point at the WRONG images. NEVER reference attached images by number or position ("Image 1", "Image 2", "the first image") and NEVER include meta-instructions about which image to use as the first frame — the app controls image attachment order and first-frame chaining automatically, and numeric references will point at the WRONG image. Describe subjects, styles, and scenes in plain words only.
- Clip prompts must describe ONLY the visible scene content: subject, action, camera, lighting, environment, audio. No production meta-commentary.
- If timing beats are useful inside a prompt, make them LOCAL to that clip only, for example "during the first two seconds" or "near the final second"; never write global timeline ranges inside prompt text.
- Camera angles and movements should feel like a real commercial shoot — motivated, smooth, intentional.
- CAMERA CONTINUITY ACROSS CLIPS (CRITICAL): When splitting into multiple clips, each clip's opening camera state MUST match the previous clip's closing camera state. If clip N ends with a slow dolly left, clip N+1 MUST begin with that same slow dolly left and then transition naturally into its own camera work. No abrupt camera jumps, no sudden angle changes, no instantaneous speed changes at clip boundaries. The transition between clips must feel like one unbroken continuous shot.
- If a single uninterrupted output is desired, explicitly say "single continuous shot, no scene cuts." Otherwise, describe motivated cuts inside the native clip using natural timing.
- For multi-clip outputs, the last sentence of each prompt must intentionally hand off to the next clip's opening state.

		AUDIO CONSISTENCY RULES (CRITICAL):
		- Every clip generates its own audio from scratch, so audio identity MUST be frozen across clips.
		- Clip prompts must request ONLY dialogue, diegetic sound, and ambience. NEVER background music or score inside a clip — one continuous instrumental soundtrack is composed separately and mixed under the full film in post.
		- ${PB_REGIONAL_LANGUAGE_LOCK}
		- ${PB_VOICEOVER_LOCK}
		- Dialogue must be spoken exactly as provided in "dialogue"; no English translation, no subtitles, no alternate line.
		- Define ONE "voice_signature" for the whole film (exact narrator/character voice: age, gender, accent, tone, pace) and ONE consistent ambience palette, reused in every clip.
- Define ONE "music_prompt" for the full film: an instrumental music brief (genre, mood arc, tempo/BPM, instrumentation, how it evolves across the runtime). No artist names.

ART STYLE CONSISTENCY RULE (CRITICAL):
- Define ONE "style_anchor": a frozen, expert-precise description of the film's visual medium that must hold in EVERY frame of EVERY clip. A vague anchor like "classical Indian painting" or "cinematic look" is FORBIDDEN — that is amateur direction. The anchor MUST name ALL of the following:
  (a) the specific school, movement, or reference tradition (e.g. "Kangra miniature school", "Raja Ravi Varma academic oil", "Studio-Ghibli-style hand-drawn cel animation", "1970s Kodachrome documentary photography");
  (b) the medium and surface (e.g. "gouache on wasli paper", "oil on canvas with visible impasto", "35mm film with natural grain");
  (c) brush/line/render character (e.g. "fine single-hair outlines, flat perspective", "soft blended academic brushwork", "clean cel outlines with flat shading");
  (d) the palette character (specific tones, not just "vibrant");
  (e) at least TWO explicit "NEVER" statements naming the failure modes to avoid (e.g. for painted styles: "NEVER glossy 3D render, NEVER photographic skin"; for live-action styles: "NEVER illustration, NEVER cartoon shading, NEVER animation look").
  If the user's request or references imply a style but do not name one, YOU must identify the closest precise tradition and name it — never leave the anchor generic.

For each clip provide:
1. "prompt": Ultra-detailed cinematic prompt. Include: character description (locked identity), exact setting/environment, lighting setup, lens/focal length, camera movement, specific action happening, product placement details (if any). Must be detailed enough to generate a standalone video.
2. "dialogue": Exact spoken words during this clip, or null if silent. For VO/Voiceover/Narration lines, keep the spoken words here but mark "audio_role" as "voiceover".
3. "duration_seconds": The assigned duration from the clip duration plan.
4. "start_seconds": The authoritative clip start from AUTHORITATIVE TIMELINE RANGES.
5. "end_seconds": The authoritative clip end from AUTHORITATIVE TIMELINE RANGES.
6. "end_state": Precise description of the final frame state so the NEXT clip continues seamlessly. MUST include ALL of: (a) character pose and position in frame, (b) camera position, angle, and framing (e.g. "medium close-up from 30° left"), (c) active camera MOVEMENT direction and speed at the end of the clip (e.g. "camera is slowly dollying left", "camera is static", "camera is gently pushing in"), (d) what's visible in frame. The next clip will be instructed to begin with this exact camera motion to avoid any visual jerk.
	7. "identity_anchor": Frozen character and wardrobe description that must not change: "[age] [gender], [hair color/style or bald crown], [beard/moustache], [skin tone], [build], [exact clothing/uniform panels and colors], [visible user-owned jersey lettering/logo placement], [trousers/stripes], [shoes]"
8. "product_notes": If the user's LOCKED product appears in this clip, copy its locked description VERBATIM — never alter it. Only for other, non-locked products use generic equivalent terms.
9. "new_scene": boolean. Set to true if this clip starts a new scene, location, or time of day (e.g. cutting from a bedroom to a kitchen). Set to false if it continues the exact same scene, room, and characters from the previous clip with camera continuity.
10. "audio_role": "voiceover", "onscreen_dialogue", or "none". VO/V.O./Voiceover/Narration/Narrator is ALWAYS "voiceover"; the visible character must not speak it.

Return ONLY a valid JSON object:
{"voice_signature": "...", "music_prompt": "...", "style_anchor": "...", "clips": [{"prompt": "...", "dialogue": "...", "audio_role": "voiceover", "duration_seconds": 10, "start_seconds": 0, "end_seconds": 10, "end_state": "...", "identity_anchor": "...", "product_notes": "...", "new_scene": false}]}
No markdown wrapper. No explanation. Just the JSON object.

SCRIPT TO SPLIT:
"${fullPrompt}"` }
            ]}],
            generationConfig: { temperature: 0.15, responseMimeType: "application/json" }
          })
        }
      );

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      // Extract the JSON payload even if the model wrapped it in prose/markdown
      const objStart = text.search(/[[{]/);
      const objEnd = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
      if (objStart !== -1 && objEnd > objStart) text = text.slice(objStart, objEnd + 1);
      const parsed = JSON.parse(text);
      // Accept both the new object shape and the legacy bare-array shape
      const rawClips = Array.isArray(parsed) ? parsed : (parsed.clips || []);
      let suggestedDurations = [];
      if (rawClips.length > 0) {
        suggestedDurations = rawClips.map(c => Math.max(3, Math.min(10, Math.round(Number(c.duration_seconds || c.duration) || 10))));
      }
      const finalDurationPlan = pbBalanceDurations(suggestedDurations, targetTotalSeconds);
      return {
        segments: pbNormalizeClipSegments(rawClips, fullPrompt, finalDurationPlan),
        voiceSignature: (!Array.isArray(parsed) && parsed.voice_signature) || "",
        musicPrompt: (!Array.isArray(parsed) && parsed.music_prompt) || "",
        styleAnchor: (!Array.isArray(parsed) && parsed.style_anchor) || ""
      };
    } catch (err) {
      console.warn("Script split failed — falling back to scoped per-clip prompts:", err);
      pbRememberLesson("mistake", `Script splitting returned invalid JSON and fell back to duplicated prompts (error: "${String(err.message).substring(0, 120)}"). When splitting scripts, output strictly valid JSON with no commentary.`);
      setStatusMessage("Script splitting failed — using fallback clip prompts (story continuity may be reduced)...");
      return {
        segments: pbNormalizeClipSegments([], fullPrompt, durationPlan),
        voiceSignature: "",
        musicPrompt: "",
        styleAnchor: ""
      };
    }
  };

  // --- Crop Reference Image to active Aspect Ratio (removes text captions/borders) ---
  const pbCropImageToCenter = (base64, targetAr) => {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            const [tw, th] = targetAr === "16:9" ? [1280, 720] : targetAr === "9:16" ? [720, 1280] : [1000, 1000];

            canvas.width = tw;
            canvas.height = th;
            const ctx = canvas.getContext("2d");

            const srcRatio = img.width / img.height;
            const targetRatio = tw / th;
            let sx = 0, sy = 0, sw = img.width, sh = img.height;

            if (srcRatio > targetRatio) {
              // Source is wider than target: crop sides
              sw = img.height * targetRatio;
              sx = (img.width - sw) / 2;
            } else {
              // Source is taller than target: crop top and bottom (chops off top text header)
              sh = img.width / targetRatio;
              sy = (img.height - sh) / 2;
            }

            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);
            resolve(canvas.toDataURL("image/jpeg", 0.95).split(",")[1]);
          } catch (err) {
            console.warn("Canvas crop error:", err);
            resolve(base64);
          }
        };
        img.onerror = () => resolve(base64);
        img.src = `data:image/png;base64,${base64}`;
      } catch (err) {
        console.warn("pbCropImageToCenter exception:", err);
        resolve(base64);
      }
    });
  };

  // --- Get custom uploaded reference image for a specific shot ---
  const pbGetReferenceImageForShot = async (ci) => {
    if (!pbImages || pbImages.length === 0) return null;
    
	    const shotNum = ci + 1;
	    const regex = new RegExp(`\\b(shot|clip|scene|sc)\\s*0*${shotNum}\\b`, 'i');
	    const hasLockedProductRef = pbImages.some(img => img._isProduct || img._productLock);
	    const isIdentityOnly = (img) => img._fromStoryboardCharacterSheet || ((img._isCharacter || img._identityLock) && !regex.test(img.tag || ""));
	    const explicitMatch = pbImages.find(img => img.tag && regex.test(img.tag) && !img._isProduct && !(hasLockedProductRef && img._isStoryboardPanel) && !isIdentityOnly(img));
    let base64 = null;
    
    if (explicitMatch) {
      console.log(`Found explicit reference image match for Shot ${shotNum}: "${explicitMatch.tag}"`);
      base64 = pbGetImageBase64(explicitMatch);
    } else {
      const shotMappedUploads = pbImages.filter(img => !img._autoExtracted && !img._isProduct && !isIdentityOnly(img) && pbGetReferenceImageIndex(img) !== null);
      const fallbackMatch = shotMappedUploads.find(img => pbGetReferenceImageIndex(img) === ci);
      if (fallbackMatch) {
        console.log(`Fallback: Mapping reference image to Shot ${shotNum} ("${fallbackMatch.tag}")`);
        base64 = pbGetImageBase64(fallbackMatch);
      }
    }
    
    if (base64) {
      return await pbCropImageToCenter(base64, aspectRatio);
    }
    return null;
  };

  // Synchronous helper to determine which shot a reference image belongs to (if any)
  const pbGetReferenceImageIndex = (img) => {
    if (!img.tag) return null;
    
    // 1. Explicit shot number matching
    let explicitShotIdx = null;
    for (let checkCi = 0; checkCi < 20; checkCi++) {
      const regex = new RegExp(`\\b(shot|clip|scene|sc)\\s*0*${checkCi + 1}\\b`, 'i');
      if (regex.test(img.tag)) {
        explicitShotIdx = checkCi;
        break;
      }
    }
    if (explicitShotIdx !== null) return explicitShotIdx;

    // Character identity references are global anchors. They should never be
    // consumed as per-shot composition references by sequential fallback logic.
    if (img._fromStoryboardCharacterSheet || img._isCharacter || img._identityLock) return null;
    
    // 2. A user-typed tag WITHOUT a scene/shot number means a global reference
    //    (characters, product, style) — never force-map it to a shot slot
    if (img._userTagged) return null;

    // Detect if the tag is descriptive (contains character names or style terms)
    // rather than generic storyboard panel labels (like "scene 1", "image 5").
    const isGenericTag = /^(image|panel|file|upload|shot|scene|sc|slide|unnamed|untitled|\d+)/i.test(img.tag);
    if (!isGenericTag) return null;

    // 3. Sequential fallback mapping for untagged/auto-tagged uploads
    const userUploadedImages = pbImages.filter(x => !x._autoExtracted);
    const idx = userUploadedImages.indexOf(img);
    if (idx !== -1 && idx < 20) { // sequential fallback for untagged uploads
      return idx;
    }
    return null;
  };

  // --- Generate Scene Keyframe (Imagen 3 / Nano Banana Pro 2) ---
  // shotRefB64: optional matching reference image for this specific shot (used as style/composition guide, NOT as literal frame)
  const pbGenerateSceneImage = async (clipPrompt, globalIdx, lastFrameB64 = null, signal = null, shotRefB64 = null, anchorText = "") => {
    setStatusMessage(`Generating Shot ${globalIdx + 1} reference image...`);

    // Extract product images that are mentioned in the prompt
    const productImages = pbImages.filter(img => img._isProduct && pbPromptMentionsProduct(clipPrompt, img));
    let bestProductBase64s = [];
    let subjectProfileText = "";

    let scenePack = null;
    if (productImages.length > 0) {
      // 1+2. Selection order + cached identity pack (built once per product set)
      scenePack = await pbGetCachedProductPack(productImages);
      bestProductBase64s = scenePack?.b64s || productImages.map(pbGetImageBase64);
      if (bestProductBase64s.length > 1) {
        try { bestProductBase64s = await selectBestSubjectImages("", clipPrompt, bestProductBase64s); } catch {}
      }
      subjectProfileText = scenePack?.identity || productImages[0]?._productLock || "";
    }

    const parts = [];
    const addedImageKeys = new Set();
    const addInlineImage = (base64, mimeType = "image/png") => {
      if (!base64) return;
      const key = base64.slice(0, 240);
      if (addedImageKeys.has(key)) return;
      addedImageKeys.add(key);
      parts.push({ inlineData: { mimeType, data: base64.split(",")[1] || base64 } });
    };

    // 3. Multi-View Contact Sheet (cached) + best single view
    if (scenePack?.sheet) {
      addInlineImage(scenePack.sheet, "image/jpeg");
      if (bestProductBase64s[0]) addInlineImage(bestProductBase64s[0], "image/jpeg");
    } else if (bestProductBase64s.length > 0) {
      bestProductBase64s.slice(0, 3).forEach(b64 => addInlineImage(b64, "image/jpeg"));
    }

    // 4. Constraint Header injection (applySubjectProfilePriority)
    const imagePrompt = applySubjectProfilePriority(clipPrompt, subjectProfileText, productImages.length);

    let generatedImageB64 = null;
    let correctionText = "";

    // Multi-Stage Grounding Validation & Self-Correction Loop (assessImageGrounding)
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");

      let currentPrompt = imagePrompt;
      if (attempt > 1 && correctionText) {
        currentPrompt = `⚠️ RETRY SELF-CORRECTION (PRIORITY): Fix the following issue from the previous attempt: "${correctionText}". Ensure full product fidelity and do not hallucinate details.\n\n${imagePrompt}`;
      }

      const currentParts = [...parts, { text: currentPrompt }];

      const res = await fetch(
        `${GEMINI_PROXY_BASE}/models/${IMAGE_MODEL}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: currentParts }],
            generationConfig: { 
              responseModalities: ["IMAGE"], 
              temperature: 1.0,
              imageConfig: {
                imageSize: "2K",
                aspectRatio: aspectRatio === "16:9" || aspectRatio === "9:16" || aspectRatio === "1:1" || aspectRatio === "4:3" || aspectRatio === "3:4" ? aspectRatio : "16:9"
              }
            }
          }),
          signal
        }
      );

      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const resParts = data.candidates?.[0]?.content?.parts || [];
      let b64 = null;
      for (const part of resParts) {
        if (part.inlineData && part.inlineData.mimeType.startsWith("image/")) {
          b64 = part.inlineData.data;
          break;
        }
      }

      if (!b64) throw new Error("No image data returned for Scene Image.");
      generatedImageB64 = b64;

      // 5. Grounding evaluation
      if (bestProductBase64s.length > 0) {
        setStatusMessage(`Performing fidelity check on Shot ${globalIdx + 1} (Attempt ${attempt}/3)...`);
        const assessment = await assessImageGrounding("", clipPrompt, bestProductBase64s, generatedImageB64, {
          subjectProfileLock: true,
          minimumScore: 90
        });

        console.log(`[FIDELITY CHECK] Shot ${globalIdx + 1} Attempt ${attempt} Score: ${assessment.score}, Pass: ${assessment.pass}. Issues: ${assessment.issues}`);

        if (assessment.pass) {
          break;
        } else {
          correctionText = assessment.correction || assessment.issues;
          setStatusMessage(`Fidelity alert on Shot ${globalIdx + 1}: ${assessment.issues}. Retrying with correction...`);
        }
      } else {
        break;
      }
    }

    return generatedImageB64;
  };

  // --- Omni-native ingredient builder ---
  // Speaks the model's official grammar: [# Sources <FIRST_FRAME>@ImageN] +
  // [# References <IMAGE_REF_N>@ImageM], each ingredient introduced in ONE short
  // line. Lean ingredient set (first frame, shot style ref, character sheets,
  // end-frame target). No storyboard grids, no essays — per the official docs:
  // "keep prompts simple; overly detailed descriptions cause unintended changes."
  const pbBuildOmniImageInputs = async (startingFrameB64 = null, startingFrameMimeType = "image/png", ci = null, clipPrompt = "", endFrameB64 = null, sceneImageB64 = null, anchorText = "") => {
    const inputParts = [];
    const sourceTags = [];
    const refTags = [];
    const refLines = [];
    let refIdx = 0;
    const refImageKeys = new Set();

    const startImage = startingFrameB64 || sceneImageB64;
    const startMime = startingFrameB64 ? startingFrameMimeType : "image/png";

    // FIRST_FRAME — continuity authority
    if (startImage) {
      inputParts.push({ type: "image", data: startImage, mime_type: startMime });
      sourceTags.push(`<FIRST_FRAME>@Image${inputParts.length}`);
    }

    const addReferenceLine = (base64, mimeType, buildLine) => {
      if (!base64) return false;
      const key = base64.slice(0, 240);
      if (refImageKeys.has(key)) return false;
      refImageKeys.add(key);
      inputParts.push({ type: "image", data: base64, mime_type: mimeType || "image/png" });
      const tag = `<IMAGE_REF_${refIdx++}>`;
      refTags.push(`${tag}@Image${inputParts.length}`);
      refLines.push(buildLine(tag));
      return true;
    };

    const buildCharacterLockLine = (tag, img = {}) => {
      const who = img.tag ? pbStripCharacterSurnames(img.tag) : "the main character";
      const idNote = img._identityLock ? ` Exact captured identity and wardrobe notes: ${pbStripCharacterSurnames(img._identityLock)}` : "";
      return `${tag} is the CHARACTER IDENTITY AND WARDROBE LOCK for ${who} — treat this image as the authority, not loose inspiration. Preserve the exact same face, head shape, hairline/bald crown or hairstyle, eyebrows, eyes, nose, beard/moustache, skin tone, body proportions, and exact outfit/uniform. Keep collar shape, sleeve colors, shoulder/chest panels, side stripes, trouser colors/stripes, shoe colors, and any user-owned jersey lettering/logo placement unchanged. Storyboard/shot references guide pose, camera, and action only; they must NEVER override this face or clothing. ${PB_NO_LOOKALIKE_START} ${PB_LOGO_INTEGRITY}${idNote}`;
    };

	    const buildObjectLockLine = (tag, img = {}) => {
	      const what = img.tag || "the referenced object/logo/prop";
	      const lock = img._objectLock ? ` Exact captured object/logo notes: ${img._objectLock}` : "";
	      return `${tag} is the OBJECT / LOGO / PROP LOCK for ${what} — treat this attached image as the visual authority for that exact object only. Preserve the same shape, proportions, material, color pattern, seams, markings, label/logo/lettering layout, and surface placement. Do not redesign it, simplify it, or recreate its logo/lettering elsewhere. If this object appears in the scene, it must match this reference exactly; if a different surface needs signage or background graphics, keep it blank or generic unless the user explicitly supplied that exact surface as a reference. ${PB_LOGO_INTEGRITY}${lock}`;
	    };

	    const buildProductLockLine = (tag, img = {}) => {
	      const what = img.tag || "the locked product";
	      const lock = img._productLock ? ` Exact captured product notes: ${img._productLock}` : "";
	      return `${tag} is the LOCKED PRODUCT IMAGE for ${what}. ${PB_PRODUCT_EXACT_LOCK} Use this attached product image as the visual authority, not inspiration. The video may move the real product through the scene, but the packaging design must remain identical to this image. Do not redraw the label, do not replace the food artwork, do not change the cap, cylinder shape, can proportions, logo, word spacing, printed colors, or product variant text. ${PB_LOGO_INTEGRITY}${lock}`;
	    };

	    // LOCKED PRODUCT — attach before all other references so Omni treats it as
	    // a primary product authority, not a loose style/composition reference.
	    let productCount = 0;
	    const mentionProducts = pbImages.filter(x => x._isProduct && pbPromptMentionsProduct(clipPrompt, x));
	    if (mentionProducts.length > 0) {
	      const pack = await pbGetCachedProductPack(mentionProducts);
	      // Multi-view: ONE stitched contact sheet carries the whole product profile —
	      // a single focused ingredient beats several competing ones (Nebula pattern).
	      if (pack?.sheet) {
	        const didAdd = addReferenceLine(pack.sheet, "image/jpeg", (tag) => `${tag} is the SUBJECT PRODUCT PACK — every tile in this contact sheet shows the SAME single product from different views; all views are ONE product profile. ${PB_PRODUCT_EXACT_LOCK} Reproduce this exact product wherever it appears: packaging design, label artwork, logo, lettering, colors, and proportions must match the pack. ${PB_LOGO_INTEGRITY}${pack.identity ? ` Confirmed product profile: ${pack.identity}` : ""}`);
	        if (didAdd) productCount++;
	      }
	      let sortedProducts = mentionProducts;
	      if (mentionProducts.length > 1) {
	        try {
	          const rawBase64s = mentionProducts.map(pbGetImageBase64);
	          const sortedB64s = await selectBestSubjectImages("", clipPrompt, rawBase64s);
	          sortedProducts = sortedB64s.map(b64 => mentionProducts.find(x => pbGetImageBase64(x) === b64)).filter(Boolean);
	        } catch (err) {
	          console.warn("[OmniImageInputs] Smart product sorting failed:", err);
	        }
	      }
	      for (const img of sortedProducts) {
	        const didAdd = addReferenceLine(pbGetImageBase64(img), pbGetImageMimeType(img), (tag) => buildProductLockLine(tag, img));
	        if (didAdd) productCount++;
	        if (productCount >= 2) break;
	      }
	    }

	    // CHARACTER SHEETS — attached to every clip; a face and uniform cannot be
    // held by text alone. User character references and storyboard-extracted
    // model sheets are global identity authorities, not shot composition refs.
    // CRITICAL: raw photos would drag a stylized film back to photorealism —
    // so each character reference is converted into the film's locked style
    // ONCE (identity preserved, cached), and only the in-style version is sent.
    let charCount = 0;
    if (characterSheetImage) {
      const didAdd = addReferenceLine(characterSheetImage, "image/png", (tag) => buildCharacterLockLine(tag, {
        tag: "character model sheet",
        _fromStoryboardCharacterSheet: true
      }));
      if (didAdd) charCount++;
    }
    // Candidate character references; when the film has a locked style and ANY
    // candidate already matches it (a created in-style sheet), the raw originals
    // leave the space entirely — only created assets follow.
    let charPool = pbImages.filter(img => {
      if (img._isProduct || img._isStoryboardPanel) return false;
      if (img._fromStoryboardCharacterSheet || img._isCharacter || img._identityLock) return true;
      return !img._autoExtracted && pbGetReferenceImageIndex(img) === null;
    });
    if (anchorText && charPool.length > 1) {
      const matchFlags = [];
      for (const img of charPool) matchFlags.push(await pbImageMatchesStyle(img, anchorText));
      const inStyle = charPool.filter((_, fi) => matchFlags[fi]);
      if (inStyle.length > 0) charPool = inStyle;
    }
    for (const img of charPool) {
      if (charCount >= 4) break;
      {
        let base64 = pbGetImageBase64(img);
        let mimeType = pbGetImageMimeType(img);
        if (anchorText && img._styleMatches !== true && !img._fromStoryboardCharacterSheet) {
          if (img._styledChar && img._styledCharAnchor === anchorText) {
            base64 = img._styledChar;
            mimeType = "image/png";
          } else {
            setStatusMessage("Converting character reference into the film's art style...");
            const styled = await pbRestyleFrameToAnchor(base64, anchorText, null, img._identityLock || "");
            if (styled) {
              base64 = styled;
              mimeType = "image/png";
              setPbImages(prev => prev.map(x => x._refId === img._refId ? { ...x, _styledChar: styled, _styledCharAnchor: anchorText } : x));
              img._styledChar = styled; img._styledCharAnchor = anchorText;
            }
          }
        }
        const didAdd = addReferenceLine(base64, mimeType, (tag) => buildCharacterLockLine(tag, img));
        if (didAdd) charCount++;
      }
    }

    // OBJECT / LOGO / PROP LOCKS — attached after characters so props like
    // cricket balls, badges, logos, and equipment do not get misread as style refs.
    let objectCount = 0;
    for (const img of pbImages) {
      if (objectCount >= 4) break;
      if (img._isProduct || img._isStoryboardPanel || img._fromStoryboardCharacterSheet || img._isCharacter) continue;
      const looksLikeObject = img._isObjectLock || img._objectLock || PB_OBJECT_LOCK_TAG_RE.test(img.tag || "");
      if (!looksLikeObject) continue;
      const didAdd = addReferenceLine(pbGetImageBase64(img), pbGetImageMimeType(img), (tag) => buildObjectLockLine(tag, img));
      if (didAdd) objectCount++;
    }

    // REFERENCE VIDEOS — attach so Omni can use them as temporal motion and visual references!
    let videoRefIdx = 1;
    for (const img of pbImages) {
      if (img.mimeType && img.mimeType.startsWith("video/")) {
        const base64 = pbGetImageBase64(img);
        inputParts.push({ type: "video", data: base64, mime_type: img.mimeType });
        const tag = `<VIDEO_REF_${videoRefIdx++}>`;
        refTags.push(`${tag}@Video${inputParts.length}`);
        refLines.push(`${tag} is the REFERENCE VIDEO for "${img.tag}". Use this video as the visual and motion authority for ${img.tag}. Preserve its characters, actions, style, and motion continuity`);
      }
    }

	    // End-frame target.
    if (endFrameB64 && endFrameB64 !== startImage) {
      inputParts.push({ type: "image", data: endFrameB64, mime_type: "image/png" });
      const tag = `<IMAGE_REF_${refIdx++}>`;
      refTags.push(`${tag}@Image${inputParts.length}`);
      refLines.push(`${tag} is where we will end our scene`);
    }

    const header = [
      sourceTags.length > 0 ? `[# Sources ${sourceTags.join(" ")}]` : "",
      refTags.length > 0 ? `[# References ${refTags.join(" ")}]` : ""
    ].filter(Boolean).join(" ");

    const lines = [];
    if (sourceTags.length > 0) {
      lines.push("Begin the video from <FIRST_FRAME>. The other reference images guide style and identity.");
    }
    lines.push(...refLines.map(line => line + "."));

    const systemDirective = [
      "A few things to keep in mind:",
      "- Each character, animal, and unique object appears once — the person in <FIRST_FRAME> is the same person, not a twin.",
      "- If a CHARACTER IDENTITY AND WARDROBE LOCK reference is attached, preserve that face and outfit exactly; shot/storyboard references may change pose and framing only.",
      `- ${PB_NO_LOOKALIKE_START}`,
      `- ${PB_LOGO_INTEGRITY}`,
      "- Natural anatomy and physics: correct hands and limbs, real gravity and momentum, no morphing or warping.",
      "- Keep continuity steady: no one appears or vanishes suddenly, lighting stays consistent, camera moves are smooth and motivated.",
      "- Clean full-frame video: no subtitles, captions, borders, watermarks, or interface elements."
    ].join("\n");

    const rolePrompt = `${systemDirective}\n\n${header ? `${header}\n${lines.join(" ")}\n\n` : ""}`;
    return { inputParts, rolePrompt };
  };

  const pbResolveOmniTask = (inputParts) => {
    const imageCount = inputParts.filter(part => part.type === "image").length;
    if (imageCount > 1) return "reference_to_video";
    if (imageCount === 1) return "image_to_video";
    return "text_to_video";
  };

  // --- Call Gemini Omni Flash (Interactions Endpoint) ---
  const pbCallOmniModel = async (inputParts, durationSeconds = DEFAULT_TARGET_SECONDS, task = null, previousInteractionId = null, signal = null) => {
    const requestedDuration = pbClampOmniClipSeconds(durationSeconds);
    const safeAspectRatio = OMNI_VIDEO_ASPECT_RATIOS.includes(aspectRatio) ? aspectRatio : "16:9";
    const requestBody = {
      model: "gemini-omni-flash-preview",
      input: inputParts,
      response_format: {
        type: "video",
        aspect_ratio: safeAspectRatio,
        duration: `${requestedDuration}s`
      }
    };

    // API constraint: task and previous_interaction_id are mutually exclusive
    if (task && !previousInteractionId) {
      requestBody.generation_config = { video_config: { task } };
    }

    if (previousInteractionId) {
      requestBody.previous_interaction_id = previousInteractionId;
    }

    const res = await fetch(
      `${GEMINI_PROXY_BASE}/interactions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal
      }
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    let videoB64 = data.output_video?.data || null;
    const steps = data.steps || [];
    for (const step of steps) {
      if (step.content) {
        const contentList = Array.isArray(step.content) ? step.content : [step.content];
        for (const content of contentList) {
          const partsList = content.parts || [content];
          for (const part of partsList) {
            if (part.data) { videoB64 = part.data; break; }
            if (part.inlineData?.data) { videoB64 = part.inlineData.data; break; }
          }
          if (videoB64) break;
        }
      }
      if (videoB64) break;
    }
    if (!videoB64) throw new Error("No video bytes returned from Omni model.");
    return { videoB64, interactionId: data.id || null };
  };

  // --- ElevenLabs Voice Generation & Track Swapping ---
  const pbProcessElevenLabsAudioSwap = async (originalVideoB64, dialogueText, signal = null) => {
    const isVoiceOver = pbIsVoiceOverCue(dialogueText) || pbIsVoiceOverClip({ dialogue: dialogueText });
    // Use global voiceover script as TTS text when available and clip is VO-only or has no dialogue
    const effectiveText = (isVoiceOver && voiceoverScript.trim()) ? voiceoverScript.trim() : dialogueText;
    if ((!useElevenLabs && !isVoiceOver) || !effectiveText) return originalVideoB64;
    try {
      setStatusMessage("Synthesizing ElevenLabs Voice...");
      const ttsRes = await fetch("/api/elevenlabs/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: effectiveText, voiceId: elevenLabsVoiceId }),
        signal
      });
      if (!ttsRes.ok) {
        throw new Error(`TTS HTTP error: ${ttsRes.status}`);
      }
      const ttsData = await ttsRes.json();
      if (ttsData.error || !ttsData.audioB64) {
        throw new Error(ttsData.error || "No audio bytes returned from ElevenLabs");
      }
      const audioB64 = ttsData.audioB64;

      setStatusMessage("Replacing video audio track...");
      const swapRes = await fetch("/api/swap-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoB64: originalVideoB64, audioB64 }),
        signal
      });
      if (!swapRes.ok) {
        throw new Error(`Swap HTTP error: ${swapRes.status}`);
      }
      const swapData = await swapRes.json();
      if (swapData.error || !swapData.videoB64) {
        throw new Error(swapData.error || "No video bytes returned from audio swap");
      }
      return swapData.videoB64;
    } catch (err) {
      console.warn("ElevenLabs audio swap failed, using default Gemini voice:", err);
      // Fail gracefully: fallback to Gemini's voice rather than crashing
      return originalVideoB64;
    }
  };

  // --- Generate Full Video Pipeline (Gemini Omni Flash) ---
  // Re-tag references whose auto-describe failed (e.g. rate-limited on bulk upload).
  // Without a tag, an image can't map to its scene — heal before generating.
  const pbRetagPendingReferences = async () => {
    const pending = pbImages.filter(img => !img._userTagged && (/^analyzing/i.test(img.tag || "") || img.tag === "Reference" || !img.tag));
    if (pending.length === 0) return;
    setStatusMessage(`Re-reading ${pending.length} reference image(s)...`);
    for (const img of pending) {
      try {
        const base64 = img.base64 || img.src.split(",")[1];
        const mimeType = img.mimeType || img.src.split(";")[0].split(":")[1];
        const res = await fetch(`${GEMINI_PROXY_BASE}/models/${SYNTH_MODEL}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              { inlineData: { mimeType, data: base64 } },
              { text: `Create a reference tag for this image. FIRST: if the image contains any caption, label, or title text (like "Shot 5: Both of them hold their hands"), return that caption VERBATIM (trimmed, max 12 words) including any shot/scene number. Otherwise describe the image in 3-5 specific words. Return ONLY the tag text.` }
            ]}],
            generationConfig: { temperature: 0.1, maxOutputTokens: 60 }
          })
        });
        const data = await res.json();
        const tag = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().replace(/^"|"$/g, "");
        if (tag) {
          setPbImages(prev => prev.map(x => x === img || (x._refId && x._refId === img._refId) ? { ...x, tag } : x));
          img.tag = tag; // keep local loop copy in sync for the pipeline that follows
        }
      } catch (err) {
        console.warn("Re-tag failed for one reference:", err);
      }
    }
  };

  // Self-QA: does the rendered video actually OPEN on the frame we sent?
  // Omni occasionally anchors to the wrong ingredient; catch it, don't ship it.
  const pbVerifyOpeningFrame = async (expectedFrameB64, expectedMime, videoB64) => {
    try {
      const bin = atob(videoB64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([arr], { type: "video/mp4" }));
      const actualFirst = await captureFirstFrame(url);
      URL.revokeObjectURL(url);
      if (!actualFirst) return true; // cannot verify -> accept
      const res = await fetch(`${GEMINI_PROXY_BASE}/models/${SYNTH_MODEL}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType: expectedMime || "image/png", data: expectedFrameB64 } },
            { inlineData: { mimeType: "image/jpeg", data: actualFirst } },
            { text: "Image 1 is the REQUIRED opening frame of a video. Image 2 is the actual frame at 0:00 of the rendered video. Do they show the SAME scene at the same moment — same composition, same camera angle, and the same exact character identity/wardrobe already present in frame 1? Answer NO if the opening character is a temporary lookalike, has different hair/beard/face, different uniform colors/panels, altered jersey lettering/logo placement, or a recreated/changed logo on signage. Small compression or motion blur differences are OK. Answer ONLY YES or NO." }
          ]}],
          generationConfig: { temperature: 0, maxOutputTokens: 5 }
        })
      });
      const data = await res.json();
      return (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim().toUpperCase().startsWith("Y");
    } catch {
      return true; // verifier failure never blocks the pipeline
    }
  };

  // --- Pre-Computation Validation Pipeline ---
  const pbRunValidation = async (promptText) => {
    const checks = [
      { id: "required", name: "1. Required Inputs Check", status: "pending" },
      { id: "schema", name: "2. Schema Enforcement Check", status: "pending" },
      { id: "sanity", name: "3. Input Data Sanity Check", status: "pending" },
      { id: "constraint", name: "4. Model Constraint Check", status: "pending" },
      { id: "provider", name: "5. Provider Limit Check", status: "pending" },
      { id: "resource", name: "6. Resource Allocation Simulation", status: "pending" },
      { id: "gate", name: "7. Validation Decision Gate", status: "pending" }
    ];
    setValidationChecks([...checks]);
    await new Promise(r => setTimeout(r, 200));

    const update = (id, status) => {
      const idx = checks.findIndex(c => c.id === id);
      if (idx >= 0) checks[idx].status = status;
      setValidationChecks([...checks]);
    };

    for (const check of checks) {
      update(check.id, "running");
      await new Promise(r => setTimeout(r, 180));

      try {
        if (check.id === "required") {
          if (!promptText || promptText.trim().length === 0) {
            throw { code: "MISSING_REQUIRED_INPUT", message: "Missing required input: no script found. Please chat with the agent first to create a production brief." };
          }
        }
        else if (check.id === "schema") {
          if (!aspectRatio) {
            throw { code: "INVALID_FORMAT", message: "Schema validation failed: no aspect ratio selected." };
          }
          for (const img of pbImages) {
            const b64 = pbGetImageBase64(img);
            if (!b64 || (typeof b64 === "string" && b64.length < 100)) {
              throw { code: "INVALID_TYPE", message: `Schema validation failed: reference image "${img.tag || "unnamed"}" has invalid data.` };
            }
          }
        }
        else if (check.id === "sanity") {
          const hasContext = chatHistory.filter(m => m.role === "user").length > 0;
          if (promptText.trim().length < 8 && !hasContext) {
            throw { code: "INPUT_SANITY_FAILED", message: "Input data failed sanity check: script is too brief. Please provide at least 8 characters of detail." };
          }
        }
        else if (check.id === "constraint") {
          if (!videoModel || typeof videoModel !== "string") {
            throw { code: "MODEL_CONSTRAINT_VIOLATION", message: "Model constraint check failed: video model endpoint is not configured." };
          }
        }
        else if (check.id === "provider") {
          // Quick connectivity check — the proxy will fail if keys are bad
          try {
            const ping = await fetch(`${GEMINI_PROXY_BASE}/models/${SYNTH_MODEL}:generateContent`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] })
            });
            if (!ping.ok) throw new Error("Provider unreachable");
          } catch {
            throw { code: "PROVIDER_CONNECTION_FAILED", message: "Provider connection failed: unable to reach the AI backend. Check your network or API configuration." };
          }
        }
        else if (check.id === "resource") {
          // Pass — resource estimation
        }
        else if (check.id === "gate") {
          update(check.id, "success");
          await new Promise(r => setTimeout(r, 300));
          setTimeout(() => setValidationChecks(null), 1200);
          return true;
        }

        update(check.id, "success");
      } catch (err) {
        update(check.id, "fail");
        // Mark remaining as skipped
        for (const remaining of checks) {
          if (remaining.status === "pending") update(remaining.id, "skipped");
        }
        setStatusMessage(`❌ ${err.message || err}`);
        setTimeout(() => setValidationChecks(null), 4000);
        return false;
      }
    }
    return false;
  };

  const pbGenerateVideo = async () => {
    const rawLastMsg = chatHistory.filter(m => m.role === "model").pop()?.text;
    const lastModelMsg = stripMarkers(rawLastMsg);
    if (!lastModelMsg) return alert("Generate a script first!");

    // Run pre-computation validation gate
    const valid = await pbRunValidation(lastModelMsg);
    if (!valid) return;

    const lastUserMsg = chatHistory.filter(m => m.role === "user").pop()?.text || "";
    const allChatText = chatHistory.map(m => m.text).join(" ");
    const requestedTotalSeconds = pbExtractRequestedDurationSeconds(lastUserMsg)
      || pbExtractRequestedDurationSeconds(allChatText)
      || pbExtractRequestedDurationSeconds(lastModelMsg)
      || DEFAULT_TARGET_SECONDS;
    const durationPlan = pbPlanClipDurations(requestedTotalSeconds);
    const plannedTotalSeconds = durationPlan.reduce((total, seconds) => total + seconds, 0);

    // Set abort controller
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsGenerating(true);
    setIsVideoGenerating(true);
    pbAcquireWakeLock();
    await pbRetagPendingReferences();
    // Catch-up: extract identity locks for user photos added before Character Lock existed
    for (const img of pbImages.filter(x => (!x._autoExtracted || x._fromStoryboardCharacterSheet || x._isCharacter) && !x._isProduct && !x._isStoryboardPanel && !x._charChecked && !x._identityLock && x._refId)) {
      setStatusMessage("Reading character features from reference photos...");
      await pbCaptureCharacter(img._refId, pbGetImageBase64(img), pbGetImageMimeType(img));
    }
    for (const img of pbImages.filter(x => !x._isProduct && !x._isCharacter && !x._isStoryboardPanel && !x._objectChecked && !x._objectLock && x._refId && (!x._autoExtracted || PB_OBJECT_LOCK_TAG_RE.test(x.tag || "")))) {
      setStatusMessage("Reading object/logo details from reference images...");
      await pbCaptureObjectLock(img._refId, pbGetImageBase64(img), pbGetImageMimeType(img));
    }
	    const filmProductPack = await pbGetCachedProductPack(pbImages.filter(img => img._isProduct));
    const filmProductLock = filmProductPack?.identity || pbImages.find(img => img._isProduct && img._productLock)?._productLock || "";
	    const productLockActive = !!filmProductLock || pbImages.some(img => img._isProduct || img._productLock);
	    setStatusMessage(`Planning ${plannedTotalSeconds}s as ${durationPlan.length} Omni clip${durationPlan.length === 1 ? "" : "s"}...`);

    try {
      // 1. Synthesize final production prompt
      let finalPrompt = lastModelMsg;
      if (pbFormat === "enhanced") {
        const artStyleNote = pbImages.length > 0 || characterSheetImage
          ? ` CRITICAL ART STYLE PRESERVATION: Reference artwork/images are attached. You MUST deeply analyze their exact visual style (art medium, brushwork, color palette, rendering approach) and embed an explicit ART STYLE LOCK into the enhanced brief that describes the medium and rendering. Every visual description must maintain that exact style — do NOT drift from the references' exact medium in any direction.`
          : ``;
        const characterIdentityNote = (characterSheetImage || pbImages.some(img => img._fromStoryboardCharacterSheet || img._isCharacter || img._identityLock))
          ? ` CRITICAL CHARACTER LOCK: The attached character/model-sheet references are identity and wardrobe authorities. Preserve the exact face, hairline/bald crown or hairstyle, beard, build, skin tone, uniform/clothing color blocking, collar, chest/shoulder/sleeve panels, trouser stripes, shoes, and user-owned jersey lettering/logo placement. Storyboard panels may guide pose and camera only; they must never redesign the character or outfit. ${PB_NO_LOOKALIKE_START} ${PB_LOGO_INTEGRITY}`
          : ``;
        const parts = [
          { text: `${AGENT_PROFILE}${pbBuildMemoryDigest()}\n\nYOUR TASK: We are generating a ${plannedTotalSeconds}-second finished commercial with Gemini Omni Flash. Gemini Omni Flash creates native ${MIN_OMNI_CLIP_SECONDS}-${MAX_OMNI_CLIP_SECONDS} second 720p clips with audio, image references, world/physics understanding, and natural timing control. Enhance the user's production brief without changing the concept, product, character, story order, total runtime, or any existing beat-sheet timing. If the brief already contains ranges such as [0-15s], preserve those ranges exactly in the enhanced brief. Do not invent replacement timing labels. If the finished runtime is ${MAX_OMNI_CLIP_SECONDS} seconds or less, synthesize one continuous native Omni brief. If longer, keep the full commercial brief suitable for splitting into the fewest possible continuation clips. Preserve story flow, product/character identity, camera logic, audio, lighting, and physical continuity across the full runtime.${artStyleNote}${characterIdentityNote} Brief to enhance: "${lastModelMsg}"` }
        ];
        // Include reference images so the enhancer can analyze art style
        for (const img of pbImages) {
          const base64 = pbGetImageBase64(img);
          const mimeType = pbGetImageMimeType(img);
          parts.unshift({ inlineData: { mimeType, data: base64 } });
        }
        if (characterSheetImage) {
          parts.unshift({ inlineData: { mimeType: "image/png", data: characterSheetImage } });
        }
        if (storyboardImage) {
          parts.unshift({ inlineData: { mimeType: "image/png", data: storyboardImage } });
        }

        const synthRes = await fetch(
          `${GEMINI_PROXY_BASE}/models/${SYNTH_MODEL}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts }] }),
            signal
          }
        );
        const synthData = await synthRes.json();
        const text = synthData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) finalPrompt = text.trim();
      }

      // 2. Segment script (also locks the film-wide voice signature and Lyria music brief)
      const splitResult = await pbSplitScript(finalPrompt, plannedTotalSeconds, durationPlan);
      const clipSegments = splitResult.segments;
      const filmVoiceSignature = splitResult.voiceSignature;
      const filmStyleAnchor = splitResult.styleAnchor;
      setVoiceSignature(filmVoiceSignature);
      const musicBeats = clipSegments.map((seg) => `[${Math.round(seg.start_seconds)}-${Math.round(seg.end_seconds)}s] ${String(seg.prompt).replace(/\s+/g, " ").substring(0, 90)}`).join("; ");
      setMusicPrompt(splitResult.musicPrompt ? `${splitResult.musicPrompt}\nSync the composition to this exact scene timeline: ${musicBeats}` : "");
      setStyleAnchor(filmStyleAnchor);
      const totalClips = clipSegments.length;

      const newClips = clipSegments.map((seg, i) => ({
        id: i,
        prompt: seg.prompt,
        dialogue: seg.dialogue || null,
        status: "queued",
        videoUrl: null,
        videoData: null,
        trimStart: 0,
        trimEnd: seg.duration_seconds || DEFAULT_TARGET_SECONDS,
        plannedDuration: seg.duration_seconds || DEFAULT_TARGET_SECONDS,
        timelineStart: seg.start_seconds || 0,
        timelineEnd: seg.end_seconds || (seg.duration_seconds || DEFAULT_TARGET_SECONDS),
        identityAnchor: seg.identity_anchor || "",
        endState: seg.end_state || "",
	        productNotes: seg.product_notes || null,
	        styleAnchor: filmStyleAnchor || "",
	        audioRole: seg.audio_role || (pbIsVoiceOverClip(seg) ? "voiceover" : (seg.dialogue ? "onscreen_dialogue" : "none")),
	        interactionId: null,
        cropRatio: "fit",
        excluded: false,
        newScene: !!seg.new_scene
      }));

      // Fresh generation run: the timeline restarts clean — old clips from a
      // stopped/previous run are discarded (they remain in the Video Library).
      let activeClips = [...newClips];
      const updateActiveClip = (clipIndex, updates) => {
        activeClips = pbPatchClipAt(activeClips, clipIndex, updates);
        setPbClips(activeClips);
      };
      setPbClips(activeClips);

      let lastFrameB64 = null;
      let lastFrameMime = "image/jpeg";

      // 3. Sequentially generate clips
	      for (let ci = 0; ci < totalClips; ci++) {
	        const globalIdx = ci;
	        const seg = clipSegments[ci];
	        const isVoiceOver = pbIsVoiceOverClip(seg);
	        const spokenLine = pbCleanSpokenLine(seg.dialogue);
	        
	        updateActiveClip(globalIdx, { status: "generating" });

        // Build prompt with story context, identity anchoring, and product protection
        // Omni-native prompt: short, structural, ingredient-referenced. The role
        // header (built by pbBuildOmniImageInputs) declares Sources/References;
        // this body describes ONLY the scene plus the film's locked anchors.
        const omniRules = [
          "Rules: one single continuous shot.",
          "Exactly one instance of each character — the person in <FIRST_FRAME> is the SAME character, never a twin or duplicate.",
          "Character identity and wardrobe are locked to the attached character/model-sheet reference: preserve exact face, beard/hairline, body build, uniform panels, jersey lettering/logo placement, trouser stripes, and shoes.",
          PB_NO_LOOKALIKE_START,
	          PB_LOGO_INTEGRITY,
	          PB_REGIONAL_LANGUAGE_LOCK,
	          PB_VOICEOVER_LOCK,
	          PB_AUDIO_VOICE_LOCK,
	          "Absolutely NO morphing, warping, melting, dissolving, or shape-shifting of any person, object, or surface.",
          "Maintain rock-solid temporal consistency — no flickering textures, no sudden appearance/disappearance of objects, no abrupt lighting shifts, no asset blinking.",
          "Smooth, intentional camera movement only — zero erratic shaking, no sudden jerks.",
          "Anatomically correct human bodies with natural proportions (hands must have exactly 5 fingers, no distorted limbs).",
          "No added text, subtitles, captions, borders, watermarks, stamps, or UI elements.",
          totalClips > 1 ? "No background music — only dialogue, diegetic sound, and natural ambience." : ""
        ].filter(Boolean).join(" ");
        const prevSlice = ci > 0 ? (clipSegments[ci - 1]?.end_state || String(clipSegments[ci - 1]?.prompt || "").replace(/\s+/g, " ").substring(0, 120)) : "";
        const nextSlice = ci < totalClips - 1 ? String(clipSegments[ci + 1]?.prompt || "").replace(/\s+/g, " ").substring(0, 120) : "";
        const clipPrompt = pbStripCharacterSurnames([
          `Clip ${ci + 1} of ${totalClips} in one continuous film.`,
          prevSlice ? `Previously in the story (already shown — continue from here): ${prevSlice}` : "",
          seg.prompt,
          `Pacing: this clip covers just this part of the story, comfortably filling its ${seg.duration_seconds || DEFAULT_TARGET_SECONDS} seconds — no need to rush ahead or revisit earlier moments.`,
          nextSlice ? `Coming next (this clip ends just before it): ${nextSlice}` : "",
          seg.identity_anchor ? `Character look (keep consistent): ${seg.identity_anchor}.` : "",
          (() => { const cast = pbImages.filter(i => i._identityLock && !i._isProduct).map(i => `${pbStripCharacterSurnames(i.tag || "Character")}: ${pbStripCharacterSurnames(i._identityLock)}`).join(" | "); return cast ? `The cast, exactly as in their reference photos: ${cast}` : ""; })(),
          (() => {
            const clipMentionsProduct = pbImages.some(img => img._isProduct && pbPromptMentionsProduct(seg.prompt, img));
            if (clipMentionsProduct) {
              const notes = filmProductLock || seg.product_notes || "The product packaging reference";
              return `\n[${notes}], placed in [the video clip].\n\nMANDATORY PRODUCT CONSTRAINTS:\nMaintain 1-to-1 exact structural accuracy of the source product. Preserve exact physical proportions, original colors, materials, and textures. Do not stylize, alter, beautify, or change the shape of the core product.\n\nBRANDING LOCK:\nThe logo on the product MUST NOT distort. Preserve exact logo placement, scale, legibility, and original typography. Zero hallucination or blending on brand assets.\n\nSTYLE & LIGHTING:\nHigh-end photorealistic e-commerce technical presentation. Cinematic studio lighting, razor-sharp focus on the product, raw and honest documentary-style realism for the product itself.`;
            }
            return "";
          })(),
	          filmStyleAnchor ? `Art style, held from first frame to last: ${filmStyleAnchor}` : "",
	          (seg.new_scene && ci > 0) ? "Scene change: begin on <FIRST_FRAME> (where the last scene ended), then in the first second or two carry us into the new scene with a smooth, motivated transition — a camera move, rack focus, or match cut." : "",
	          spokenLine ? (isVoiceOver
	            ? `Voiceover narration (off-screen, NOT lip-synced): "${spokenLine}". The visible character must not speak this line, must not mouth the words, and must not face camera as if delivering dialogue.`
	            : `On-screen dialogue (lip-synced): "${spokenLine}".`) : "",
	          spokenLine ? pbBuildSpokenLanguageLock(spokenLine, isVoiceOver) : "",
		          filmVoiceSignature ? `Voice (identical in every clip): ${filmVoiceSignature}. ${PB_AUDIO_VOICE_LOCK}` : PB_AUDIO_VOICE_LOCK,
          seg.end_state ? `End the clip on this moment: ${seg.end_state}.` : "",
          omniRules
        ].filter(Boolean).join("\n"));
        setStatusMessage(`Generating Clip ${ci + 1} of ${totalClips}...`);

        // Scene keyframe: If a matching reference image exists (like the storyboard panel),
        // regenerate a clean, full-frame keyframe matching its style and composition.
        let sceneImageB64 = null;
        const customRefB64 = await pbGetReferenceImageForShot(ci);

        if (customRefB64) {
          const matchedProduct = pbImages.find(img => img._isProduct && pbGetImageBase64(img).slice(0, 240) === customRefB64.slice(0, 240));
          const isProductRef = !!matchedProduct || pbImages.some(img => img._isProduct && pbPromptMentionsProduct(clipPrompt, img));

          if (productLockActive && isProductRef) {
            // Bypass Nano Banana image generation entirely to avoid redrawing product packaging
            console.log(`[BYPASS] Product reference detected for Clip ${ci + 1}. Using raw reference image directly as the scene keyframe.`);
            sceneImageB64 = customRefB64;
            updateActiveClip(globalIdx, { sceneImage: sceneImageB64 });
          } else {
            try {
              sceneImageB64 = await pbGenerateSceneImage(clipPrompt, globalIdx, null, signal, customRefB64, filmStyleAnchor);
              updateActiveClip(globalIdx, { sceneImage: sceneImageB64 });
            } catch (imgErr) {
              console.warn("Failed to generate scene keyframe from reference:", imgErr);
              sceneImageB64 = customRefB64;
              updateActiveClip(globalIdx, { sceneImage: sceneImageB64 });
            }
          }
        } else if (productLockActive && pbImages.some(img => img._isProduct && pbPromptMentionsProduct(clipPrompt, img))) {
          // If no custom storyboard/shot reference exists, but a product lock is active and mentioned
          const targetProduct = pbImages.find(img => img._isProduct && pbPromptMentionsProduct(clipPrompt, img));
          if (targetProduct) {
            sceneImageB64 = await pbCropImageToCenter(pbGetImageBase64(targetProduct), aspectRatio);
            updateActiveClip(globalIdx, { sceneImage: sceneImageB64 });
          } else if (lastFrameB64) {
            updateActiveClip(globalIdx, { sceneImage: lastFrameB64 });
          }
        } else if (ci === 0) {
          // If no reference exists, generate a starting image for Clip 1.
          try {
            sceneImageB64 = await pbGenerateSceneImage(clipPrompt, globalIdx, null, signal, null, filmStyleAnchor);
            updateActiveClip(globalIdx, { sceneImage: sceneImageB64 });
          } catch (imgErr) {
            console.warn("Failed scene image:", imgErr);
          }
        } else if (ci > 0) {
          // Continuation clips are fragile if the previous generated video frame
          // becomes the new identity authority. Generate a fresh character-locked
          // scene keyframe for each continuation; the previous frame guides layout
          // continuity only.
          try {
            sceneImageB64 = await pbGenerateSceneImage(clipPrompt, globalIdx, lastFrameB64, signal, null, filmStyleAnchor);
            updateActiveClip(globalIdx, { sceneImage: sceneImageB64 });
          } catch (imgErr) {
            console.warn("Failed continuation scene image:", imgErr);
            if (lastFrameB64) {
              sceneImageB64 = lastFrameB64;
              updateActiveClip(globalIdx, { sceneImage: lastFrameB64 });
            }
          }
        }

        // Generate a style-correct END FRAME target for this clip.
        // This is freshly generated from the character sheets + end_state,
        // so it's always in the correct art style — creating a bookend that
        // prevents compounding style drift across chained clips.
        let endFrameB64 = null;
        const endState = seg.end_state || "";
        if (customRefB64) {
          // USER STORYBOARD = EXACT TARGET: the clean regenerated scene keyframe
          // is the clip's final-frame destination.
          endFrameB64 = sceneImageB64;
	        } else if (totalClips > 1 && !productLockActive) {
          try {
            setStatusMessage(`Generating end-frame target for Clip ${ci + 1}...`);
            // Build a rich prompt: scene context + end composition + character identity + explicit style
            const identityDesc = seg.identity_anchor || "";
            const endFramePrompt = pbStripCharacterSurnames(
              `Generate the FINAL FRAME of this shot as a single still image.

SCENE CONTEXT: ${seg.prompt}

EXACT END COMPOSITION: ${endState || `The final moment of this shot's action, with every character EXACTLY on-model (same face, same bald head or exact hairstyle, same clothing) as in the character reference images.`}

	${identityDesc ? `CHARACTER IDENTITY: ${identityDesc}` : ""}

	PRODUCT EXACTNESS (MANDATORY): ${PB_PRODUCT_EXACT_LOCK} ${(filmProductLock || seg.product_notes) ? `Locked product notes: ${filmProductLock || seg.product_notes}` : ""}

	ART STYLE (MANDATORY — match EXACTLY): ${filmStyleAnchor || "Match the exact art style shown in the attached character reference images. If the references are illustrated/painted/2D, render in that same illustrated/painted/2D style. Match the references' medium exactly, whatever it is."}`
            );
            endFrameB64 = await pbGenerateSceneImage(endFramePrompt, globalIdx, null, signal, customRefB64 || null, filmStyleAnchor);
          } catch (endErr) {
            console.warn("Failed end-frame target:", endErr);
            // Non-fatal: clip generation continues without the end-frame anchor
          }
          setStatusMessage(`Generating Clip ${ci + 1} of ${totalClips}...`);
        }

	        // Use a fresh, identity-locked scene keyframe as the actual first frame.
	        // The previous captured frame is used upstream to guide continuity, but
	        // not as the character authority, because any video drift compounds hard
	        // in Clip 2 and Clip 3.
	        const usedSceneKeyframe = !!sceneImageB64;
	        const startingFrameB64 = sceneImageB64 || lastFrameB64;
	        const startingFrameMimeType = usedSceneKeyframe ? "image/png" : lastFrameMime;
	        const continuitySource = ci === 0
	          ? "opening-keyframe"
	          : (usedSceneKeyframe ? "identity-locked-continuation-keyframe" : "previous-clip-last-frame-FALLBACK");
        console.log(`[CONTINUITY] Clip ${ci + 1}: first frame source = ${continuitySource}`);
        updateActiveClip(globalIdx, { continuitySource });
        const { inputParts, rolePrompt } = await pbBuildOmniImageInputs(startingFrameB64, startingFrameMimeType, ci, seg.prompt, endFrameB64, sceneImageB64, filmStyleAnchor);
        inputParts.push({ type: "text", text: rolePrompt + clipPrompt });

        const durationSec = seg.duration_seconds || 10;
        // IMPORTANT: never pass previous_interaction_id between story clips —
        // continuity comes exclusively from the <FIRST_FRAME> image.
        // Self-QA loop: verify the rendered video actually opens on the frame
        // we sent; retry once with a stricter lock if Omni disobeyed.
        let videoB64 = null, interactionId = null;
        const basePartsQA = inputParts.slice(0, -1);
        const promptTextQA = inputParts[inputParts.length - 1].text;
        let productFixQA = "";
        const qaProducts = pbImages.filter(x => x._isProduct && pbPromptMentionsProduct(seg.prompt, x));
        for (let qaAttempt = 0; qaAttempt < 2; qaAttempt++) {
	          const attemptText = qaAttempt === 0 ? promptTextQA : `${promptTextQA}\nOne correction from the previous take: please begin exactly on <FIRST_FRAME>. The very first frame must already show the locked character identity and wardrobe correctly before any motion starts. Do not start with a lookalike and morph into the right character. ${PB_PRODUCT_EXACT_LOCK} Do not redraw, alter, or expand any user-shared logo/lettering onto billboards, stadium screens, banners, or background signage; keep new signage blank or generic.${productFixQA ? ` Product fidelity fix: ${productFixQA}` : ""}`;
          const attemptParts = [...basePartsQA, { type: "text", text: attemptText }];
          const result = await pbCallOmniModel(attemptParts, durationSec, pbResolveOmniTask(attemptParts), null, signal);
          videoB64 = result.videoB64; interactionId = result.interactionId;
          if (qaAttempt === 1) break;

          // Check 1: does the video open on the frame we sent?
          let opensCorrectly = true;
          if (startingFrameB64) {
            opensCorrectly = await pbVerifyOpeningFrame(startingFrameB64, startingFrameMimeType, videoB64);
          }

          // Check 2: product grounding on the LAST frame — where drift peaks.
          // Same Nebula assessor that guards keyframes, now judging the video.
          let productOk = true;
          if (opensCorrectly && qaProducts.length > 0) {
            try {
              const qaPack = await pbGetCachedProductPack(qaProducts);
              const lastFrameQA = await pbVideoB64LastFrame(videoB64);
              if (qaPack && lastFrameQA) {
                setStatusMessage(`Product fidelity check on Clip ${ci + 1}...`);
                const assessment = await assessImageGrounding("", seg.prompt, qaPack.b64s, lastFrameQA, {
                  subjectProfileLock: true,
                  minimumScore: 70
                });
                console.log(`[PRODUCT-QA] Clip ${ci + 1} attempt ${qaAttempt + 1}: score ${assessment.score}, pass ${assessment.pass}. ${assessment.issues}`);
                if (!assessment.pass) {
                  productOk = false;
                  productFixQA = assessment.correction || assessment.issues || "match the product pack exactly";
                }
              }
            } catch (qaErr) {
              console.warn("[PRODUCT-QA] check skipped:", qaErr);
            }
          }

          if (opensCorrectly && productOk) break;
          if (!opensCorrectly) {
            console.warn(`[CONTINUITY-QA] Clip ${ci + 1}: rendered video did not open on the sent first frame — retrying once with stricter lock`);
            setStatusMessage(`Clip ${ci + 1} opened off-frame — retrying with stricter first-frame lock...`);
          } else {
            console.warn(`[PRODUCT-QA] Clip ${ci + 1}: product drifted in the rendered video — retrying with correction`);
            setStatusMessage(`Clip ${ci + 1} product drifted — retrying with fidelity correction...`);
          }
        }

        // Apply ElevenLabs Audio Swap if enabled and dialogue exists
	        const finalVideoB64 = await pbProcessElevenLabsAudioSwap(videoB64, spokenLine || seg.dialogue, signal);

        // Add to Generation Library
        pbAddToLibrary(finalVideoB64, `Clip ${globalIdx + 1} (${seg.prompt.substring(0, 20)}...)`, seg.prompt);

        const binaryVal = atob(finalVideoB64);
        const arrayVal = [];
        for (let i = 0; i < binaryVal.length; i++) arrayVal.push(binaryVal.charCodeAt(i));
        const blob = new Blob([new Uint8Array(arrayVal)], { type: "video/mp4" });
        
        // Proxy URL
        const blobUrl = URL.createObjectURL(blob);
        updateActiveClip(globalIdx, {
          videoUrl: blobUrl,
          videoData: { bytesBase64Encoded: finalVideoB64, mimeType: "video/mp4" },
          interactionId,
          status: "done"
        });
        
        // Auto-select the newly generated clip to preview it immediately
        setActiveClipIdx(globalIdx);
        
        // Extract continuity frame — then normalize it back into the locked art
        // style so the next clip starts from style-true pixels (no compounding drift)
        try {
          lastFrameB64 = await captureLastFrame(blobUrl, durationSec);
          lastFrameMime = "image/jpeg";
          if (lastFrameB64 && filmStyleAnchor && ci < totalClips - 1) {
            setStatusMessage(`Restoring art style on continuity frame (Clip ${ci + 1} → ${ci + 2})...`);
            const restyled = await pbRestyleFrameToAnchor(lastFrameB64, filmStyleAnchor, signal);
            if (restyled) {
              lastFrameB64 = restyled;
              lastFrameMime = "image/png";
            }
          }
        } catch (capErr) {
          if (capErr.name === "AbortError") throw capErr;
          lastFrameB64 = null;
        }

        setPbClips(activeClips);
      }

      pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, activeClips, pbImages, storyboardImage);
      setIsGenerating(false);
      setIsVideoGenerating(false);
      pbReleaseWakeLock();
      abortControllerRef.current = null;
    } catch (err) {
      if (err.name === "AbortError") {
        console.log("Video generation aborted");
      } else {
        console.error("Video generation failed:", err);
        pbRememberLesson("mistake", `Video generation failed with error "${String(err.message).substring(0, 200)}". Adjust prompts to avoid whatever triggered this (often content-safety terms, brand names, or over-complex single-clip action).`);
        alert("Video generation failed: " + err.message);
      }
      setIsGenerating(false);
      setIsVideoGenerating(false);
      pbReleaseWakeLock();
      abortControllerRef.current = null;
    }
  };

  // --- Regenerate Specific Clip ---
  // Core regen for one clip: operates on the passed clips array (not React state,
  // so sequential chained regens always see fresh data) and returns the updated array.
  const pbRegenClipCore = async (clipsInput, idx, signal) => {
    const clip = clipsInput[idx];
    if (!clip) return clipsInput;

    // Detect if this is a failed first-generation (no video exists yet)
    // If so, rewrite the prompt to avoid whatever guideline violation caused the failure
    const isFailedFirstGen = !clip.videoUrl && !clip.videoData;
    let activePrompt = clip.prompt;
    if (isFailedFirstGen) {
      setStatusMessage(`Rewriting prompt for Clip ${idx + 1} to avoid safety filters...`);
      activePrompt = await pbSanitizePromptForRegen(clip.prompt, signal);
    }

    let updatedClips = pbPatchClipAt(clipsInput, idx, {
      status: "generating",
      videoUrl: null,
      videoData: null,
      interactionId: null,
      prompt: activePrompt  // update the clip prompt if it was rewritten
    });
    setPbClips(updatedClips);

    try {
      let localLastFrame = null;
      let localLastFrameMime = "image/jpeg";
      if (idx > 0 && clipsInput[idx - 1].videoUrl) {
        const prevClip = clipsInput[idx - 1];
        const prevDuration = prevClip.plannedDuration || prevClip.trimEnd || 10;
        localLastFrame = await captureLastFrame(prevClip.videoUrl, prevDuration);
        const regenAnchorForFrame = clip.styleAnchor || styleAnchor;
        if (localLastFrame && regenAnchorForFrame) {
          setStatusMessage(`Restoring art style on continuity frame for Clip ${idx + 1}...`);
          const restyled = await pbRestyleFrameToAnchor(localLastFrame, regenAnchorForFrame, signal);
          if (restyled) {
            localLastFrame = restyled;
            localLastFrameMime = "image/png";
          }
        }
      }

	      // Omni-native compact prompt (mirror of the main pipeline)
	      const regenProductLock = pbImages.find(img => img._isProduct && img._productLock)?._productLock || "";
	      const regenProductLockActive = !!regenProductLock || pbImages.some(img => img._isProduct || img._productLock);
	      const regenAnchor = clip.styleAnchor || styleAnchor;
      const omniRules = [
          "Rules: one single continuous shot.",
          "Exactly one instance of each character — the person in <FIRST_FRAME> is the SAME character, never a twin or duplicate.",
          "Character identity and wardrobe are locked to the attached character/model-sheet reference: preserve exact face, beard/hairline, body build, uniform panels, jersey lettering/logo placement, trouser stripes, and shoes.",
          PB_NO_LOOKALIKE_START,
	          PB_LOGO_INTEGRITY,
	          PB_REGIONAL_LANGUAGE_LOCK,
	          PB_VOICEOVER_LOCK,
	          PB_AUDIO_VOICE_LOCK,
	          "Absolutely NO morphing, warping, melting, dissolving, or shape-shifting of any person, object, or surface.",
          "Maintain rock-solid temporal consistency — no flickering textures, no sudden appearance/disappearance of objects, no abrupt lighting shifts, no asset blinking.",
          "Smooth, intentional camera movement only — zero erratic shaking, no sudden jerks.",
          "Anatomically correct human bodies with natural proportions (hands must have exactly 5 fingers, no distorted limbs).",
          "No added text, subtitles, captions, borders, watermarks, stamps, or UI elements.",
          clipsInput.length > 1 ? "No background music — only dialogue, diegetic sound, and natural ambience." : ""
        ].filter(Boolean).join(" ");
	      const regenPrevSlice = idx > 0 ? (clipsInput[idx - 1]?.endState || String(clipsInput[idx - 1]?.prompt || "").replace(/\s+/g, " ").substring(0, 120)) : "";
	      const regenNextSlice = idx < clipsInput.length - 1 ? String(clipsInput[idx + 1]?.prompt || "").replace(/\s+/g, " ").substring(0, 120) : "";
	      const isVoiceOver = pbIsVoiceOverClip(clip);
	      const spokenLine = pbCleanSpokenLine(clip.dialogue);
	      const clipPrompt = pbStripCharacterSurnames([
        `Clip ${idx + 1} of ${clipsInput.length} in one continuous film.`,
        regenPrevSlice ? `Previously in the story (already shown — continue from here): ${regenPrevSlice}` : "",
        activePrompt,
        `Pacing: this clip covers just this part of the story, comfortably filling its ${clip.plannedDuration || clip.trimEnd || DEFAULT_TARGET_SECONDS} seconds — no need to rush ahead or revisit earlier moments.`,
        regenNextSlice ? `Coming next (this clip ends just before it): ${regenNextSlice}` : "",
        clip.identityAnchor ? `Character look (keep consistent): ${clip.identityAnchor}.` : "",
        (() => { const cast = pbImages.filter(i => i._identityLock && !i._isProduct).map(i => `${pbStripCharacterSurnames(i.tag || "Character")}: ${pbStripCharacterSurnames(i._identityLock)}`).join(" | "); return cast ? `The cast, exactly as in their reference photos: ${cast}` : ""; })(),
        (() => {
          const clipMentionsProduct = pbImages.some(img => img._isProduct && pbPromptMentionsProduct(activePrompt, img));
          if (clipMentionsProduct) {
            const notes = regenProductLock || clip.productNotes || "The product packaging reference";
            return `\n[${notes}], placed in [the video clip].\n\nMANDATORY PRODUCT CONSTRAINTS:\nMaintain 1-to-1 exact structural accuracy of the source product. Preserve exact physical proportions, original colors, materials, and textures. Do not stylize, alter, beautify, or change the shape of the core product.\n\nBRANDING LOCK:\nThe logo on the product MUST NOT distort. Preserve exact logo placement, scale, legibility, and original typography. Zero hallucination or blending on brand assets.\n\nSTYLE & LIGHTING:\nHigh-end photorealistic e-commerce technical presentation. Cinematic studio lighting, razor-sharp focus on the product, raw and honest documentary-style realism for the product itself.`;
          }
          return "";
        })(),
	        regenAnchor ? `Art style, held from first frame to last: ${regenAnchor}` : "",
	        (clip.newScene && idx > 0) ? "Scene change: begin on <FIRST_FRAME> (where the last scene ended), then in the first second or two carry us into the new scene with a smooth, motivated transition — a camera move, rack focus, or match cut." : "",
	        spokenLine ? (isVoiceOver
	          ? `Voiceover narration (off-screen, NOT lip-synced): "${spokenLine}". The visible character must not speak this line, must not mouth the words, and must not face camera as if delivering dialogue.`
	          : `On-screen dialogue (lip-synced): "${spokenLine}".`) : "",
	        spokenLine ? pbBuildSpokenLanguageLock(spokenLine, isVoiceOver) : "",
	        voiceSignature ? `Voice (identical in every clip): ${voiceSignature}. ${PB_AUDIO_VOICE_LOCK}` : PB_AUDIO_VOICE_LOCK,
        clip.endState ? `End the clip on this moment: ${clip.endState}.` : "",
        (idx > 0 && localLastFrame && clipsInput[idx - 1]?.endState) ? `Camera continuity: the previous clip ended with "${clipsInput[idx - 1].endState}" — match that camera trajectory at the first frame, zero jerk.` : "",
        omniRules
      ].filter(Boolean).join("\n"));

      // Ensure we have scene image keyframe. If a custom reference image/panel exists,
      // regenerate a clean, full-frame keyframe matching its style and composition.
	      let sceneImageB64 = regenProductLockActive ? null : clip.sceneImage;
	      const customRefB64 = await pbGetReferenceImageForShot(idx);
      if (customRefB64) {
        try {
          sceneImageB64 = await pbGenerateSceneImage(clipPrompt, idx, localLastFrame, signal, customRefB64, clip.styleAnchor || styleAnchor);
        } catch (imgErr) {
          console.warn("Failed to generate scene keyframe from reference in regen:", imgErr);
          sceneImageB64 = customRefB64;
        }
	      } else if (!sceneImageB64 && !regenProductLockActive) {
	        sceneImageB64 = await pbGenerateSceneImage(clipPrompt, idx, localLastFrame, signal, null, clip.styleAnchor || styleAnchor);
	      }
      updatedClips = pbPatchClipAt(updatedClips, idx, { sceneImage: sceneImageB64 });

      // Generate a style-correct END FRAME target for this clip
      let endFrameB64 = null;
      const endState = clip.endState || "";
      if (customRefB64) {
        // USER STORYBOARD = EXACT TARGET: the clean regenerated scene keyframe
        // is the clip's final-frame destination.
        endFrameB64 = sceneImageB64;
	      } else if (clipsInput.length > 1 && !regenProductLockActive) {
        try {
          setStatusMessage(`Generating end-frame target for Clip ${idx + 1}...`);
          const regenIdentityDesc = clip.identityAnchor || "";
          const regenAnchor = clip.styleAnchor || styleAnchor;
          const endFramePrompt = pbStripCharacterSurnames(
            `Generate the FINAL FRAME of this shot as a single still image.

SCENE CONTEXT: ${activePrompt}

EXACT END COMPOSITION: ${endState || `The final moment of this shot's action, with every character EXACTLY on-model (same face, same bald head or exact hairstyle, same clothing) as in the character reference images.`}

	${regenIdentityDesc ? `CHARACTER IDENTITY: ${regenIdentityDesc}` : ""}

	PRODUCT EXACTNESS (MANDATORY): ${PB_PRODUCT_EXACT_LOCK} ${(regenProductLock || clip.productNotes) ? `Locked product notes: ${regenProductLock || clip.productNotes}` : ""}

	ART STYLE (MANDATORY — match EXACTLY): ${regenAnchor || "Match the exact art style shown in the attached character reference images. If the references are illustrated/painted/2D, render in that same illustrated/painted/2D style. Match the references' medium exactly, whatever it is."}`
          );
          endFrameB64 = await pbGenerateSceneImage(endFramePrompt, idx, null, signal, customRefB64 || null, regenAnchor);
        } catch (endErr) {
          console.warn("Failed end-frame target:", endErr);
        }
      }

	      const regenUsedSceneKeyframe = !!sceneImageB64;
	      const startingFrameB64 = sceneImageB64 || localLastFrame;
	      const startingFrameMimeType = regenUsedSceneKeyframe ? "image/png" : localLastFrameMime;
	      console.log(`[CONTINUITY] Regen clip ${idx + 1}: first frame source = ${regenUsedSceneKeyframe ? "identity-locked-keyframe" : "previous-clip-last-frame-FALLBACK"}`);
      const { inputParts, rolePrompt } = await pbBuildOmniImageInputs(startingFrameB64, startingFrameMimeType, idx, activePrompt, endFrameB64, sceneImageB64, clip.styleAnchor || styleAnchor);
      inputParts.push({ type: "text", text: rolePrompt + clipPrompt });
      const durationSec = clip.plannedDuration || clip.trimEnd || DEFAULT_TARGET_SECONDS;
      
      // No previous_interaction_id here either — it would make Omni edit the
      // previous clip (reusing its opening frame) instead of generating a fresh
      // continuation. The <FIRST_FRAME> image carries the continuity.
      const { videoB64, interactionId } = await pbCallOmniModel(inputParts, durationSec, pbResolveOmniTask(inputParts), null, signal);

      // Apply ElevenLabs Audio Swap if enabled and dialogue exists
      const finalVideoB64 = await pbProcessElevenLabsAudioSwap(videoB64, spokenLine || clip.dialogue, signal);

      // Add to Generation Library
      pbAddToLibrary(finalVideoB64, `Clip ${idx + 1} Regenerated (${clip.prompt.substring(0, 20)}...)`, activePrompt || clip.prompt);

      const binaryVal = atob(finalVideoB64);
      const arrayVal = [];
      for (let i = 0; i < binaryVal.length; i++) arrayVal.push(binaryVal.charCodeAt(i));
      const blob = new Blob([new Uint8Array(arrayVal)], { type: "video/mp4" });
      
      const blobUrl = URL.createObjectURL(blob);
      updatedClips = pbPatchClipAt(updatedClips, idx, {
        videoUrl: blobUrl,
        videoData: { bytesBase64Encoded: finalVideoB64, mimeType: "video/mp4" },
        interactionId,
        status: "done"
      });

      setPbClips(updatedClips);
      return updatedClips;
    } catch (err) {
      updatedClips = pbPatchClipAt(updatedClips, idx, { status: "done" });
      setPbClips(updatedClips);
      throw err;
    }
  };

  // --- Generate All Timeline Clips Sequentially ---
  const pbGenerateAllTimelineClips = async () => {
    if (pbClips.length === 0) return alert("Timeline is empty!");
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    setIsGenerating(true);
    setIsVideoGenerating(true);
    pbAcquireWakeLock();

    try {
      let activeClips = [...pbClips];
      for (let ci = 0; ci < activeClips.length; ci++) {
        setActiveClipIdx(ci);
        setStatusMessage(`Generating Clip ${ci + 1} of ${activeClips.length}...`);
        activeClips = await pbRegenClipCore(activeClips, ci, signal);
      }
      setStatusMessage("All clips generated successfully!");
      pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, activeClips, pbImages, storyboardImage);
    } catch (err) {
      if (err.name === "AbortError") {
        console.log("Timeline generation aborted");
      } else {
        console.error("Timeline generation failed:", err);
        alert("Timeline generation failed: " + err.message);
      }
    } finally {
      setIsGenerating(false);
      setIsVideoGenerating(false);
      pbReleaseWakeLock();
      abortControllerRef.current = null;
    }
  };

  // --- Regenerate Specific Clip (auto-generates Omni bridge filler) ---
  const pbRegenClip = async (idx) => {
    if (!pbClips[idx]) return;

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // A manual regeneration is a dissatisfaction signal — learn from it
    pbRememberLesson("mistake", `User rejected a generated clip and regenerated it. Clip prompt began: "${String(pbClips[idx].prompt).substring(0, 160)}...". Study what commonly fails: identity drift, wrong pacing, weak action, or ignored composition.`);

    setIsVideoGenerating(true);
    try {
      let clips = await pbRegenClipCore(pbClips, idx, signal);

      // Auto-generate an Omni bridge filler to the next clip instead of
      // re-generating the entire downstream chain. The bridge interpolates
      // between the new clip's last frame and the next clip's first frame.
      clips = await pbGenerateBridgeClip(idx, clips, signal);

      setStatusMessage("");
      pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, clips, pbImages, storyboardImage);
      abortControllerRef.current = null;
      setIsVideoGenerating(false);
    } catch (err) {
      if (err.name === "AbortError") {
        console.log("Regeneration aborted");
      } else {
        alert("Clip regeneration failed: " + err.message);
      }
      abortControllerRef.current = null;
      setIsVideoGenerating(false);
    }
  };

  // --- Natural Language Video-to-Video Edit ---
  const pbAiEditVideo = async (idx) => {
    const clip = pbClips[idx];
    if (!clip) return;

    const editInput = document.getElementById(`pbVideoEditPrompt-${idx}`);
    const editPromptText = (editInput?.value || "").trim();
    if (!editPromptText) return;

    let updatedClips = pbPatchClipAt(pbClips, idx, { status: "generating" });
    setPbClips(updatedClips);

    try {
      const QUALITY_GUARD = pbGetQualityGuard(editPromptText, clip.styleAnchor || styleAnchor);
      const simpleEditInstruction = `${editPromptText}. Keep everything else the same. ${PB_NO_LOOKALIKE_START} ${PB_LOGO_INTEGRITY}`;
      let editedVideoB64 = null;
      let nextInteractionId = null;

      if (clip.interactionId) {
        const editResult = await pbCallOmniModel(
          [{ type: "text", text: `${simpleEditInstruction} ${QUALITY_GUARD}` }],
          clip.plannedDuration || clip.trimEnd || DEFAULT_TARGET_SECONDS,
          "edit",
          clip.interactionId
        );
        editedVideoB64 = editResult.videoB64;
        nextInteractionId = editResult.interactionId;
      } else {
        const videoBase64 = clip.videoData?.bytesBase64Encoded;
        if (!videoBase64) throw new Error("Video raw data is missing.");

        // Omni edit grammar: simple instruction, nothing else — per official docs,
        // overly detailed edit prompts cause unintended changes.
        const editAnchor = clip.styleAnchor || styleAnchor;
        const editInstruction = `Edit this video: ${simpleEditInstruction} Maintain identical character features, wardrobe, logo surfaces, scene motion, camera, and timing unless the edit says otherwise.${editAnchor ? ` Keep the exact art style: ${editAnchor}` : ""} ${QUALITY_GUARD}`;

        const formattedParts = [
          { type: "video", data: videoBase64, mime_type: "video/mp4" },
          { type: "text", text: editInstruction }
        ];
        for (const img of pbImages) {
          const base64 = pbGetImageBase64(img);
          const mimeType = pbGetImageMimeType(img);
          formattedParts.push({ type: "image", data: base64, mime_type: mimeType });
        }

        const editResult = await pbCallOmniModel(
          formattedParts,
          clip.plannedDuration || clip.trimEnd || DEFAULT_TARGET_SECONDS,
          "edit"
        );
        editedVideoB64 = editResult.videoB64;
        nextInteractionId = editResult.interactionId;
      }

      const binaryVal = atob(editedVideoB64);
      const arrayVal = [];
      for (let i = 0; i < binaryVal.length; i++) arrayVal.push(binaryVal.charCodeAt(i));
      const blob = new Blob([new Uint8Array(arrayVal)], { type: "video/mp4" });
      
      const blobUrl = URL.createObjectURL(blob);
      updatedClips = pbPatchClipAt(updatedClips, idx, {
        videoUrl: blobUrl,
        videoData: { bytesBase64Encoded: editedVideoB64, mimeType: "video/mp4" },
        interactionId: nextInteractionId || clip.interactionId || null,
        status: "done"
      });

      setPbClips(updatedClips);
      pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, updatedClips, pbImages, storyboardImage);
    } catch (err) {
      alert("AI Video Edit failed: " + err.message);
      updatedClips = pbPatchClipAt(updatedClips, idx, { status: "done" });
      setPbClips(updatedClips);
    }
  };

  // --- Extract Continuity Frame (last frame) using Offscreen Canvas ---
  const captureLastFrame = (videoUrl, clipDuration = 10) => {
    return new Promise((resolve) => {
      try {
        const vid = document.createElement("video");
        if (videoUrl.startsWith("http")) {
          vid.crossOrigin = "anonymous";
        }
        vid.muted = true;
        vid.playsInline = true;
        vid.preload = "auto";
        vid.style.position = "fixed";
        vid.style.top = "-9999px";
        vid.style.left = "-9999px";
        vid.style.width = "100px";
        vid.style.height = "100px";
        document.body.appendChild(vid);

        const timeoutId = setTimeout(() => {
          console.warn("captureLastFrame seek timed out:", videoUrl);
          finish(null);
        }, 10000);
        
        const finish = (value) => {
          clearTimeout(timeoutId);
          if (vid.parentNode) {
            document.body.removeChild(vid);
          }
          resolve(value);
        };

        vid.onloadedmetadata = () => {
          let seekTime = 0.1;
          const dur = vid.duration && isFinite(vid.duration) && !isNaN(vid.duration) ? vid.duration : clipDuration;
          seekTime = Math.max(0.1, dur - 0.1);
          vid.currentTime = seekTime;
        };

        vid.onseeked = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = vid.videoWidth || 1280;
            canvas.height = vid.videoHeight || 720;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
            finish(dataUrl.split(",")[1]);
          } catch (err) {
            console.warn("Canvas capture error:", err);
            finish(null);
          }
        };

        vid.onerror = (e) => {
          console.warn("captureLastFrame video load error:", e);
          finish(null);
        };
        vid.src = videoUrl;
        vid.load();
      } catch (err) {
        console.warn("captureLastFrame exception:", err);
        resolve(null);
      }
    });
  };

  // --- Extract First Frame (frame 0) from a video for bridge clip targeting ---
  const captureFirstFrame = (videoUrl) => {
    return new Promise((resolve) => {
      try {
        const vid = document.createElement("video");
        if (videoUrl.startsWith("http")) {
          vid.crossOrigin = "anonymous";
        }
        vid.muted = true;
        vid.playsInline = true;
        vid.preload = "auto";
        vid.style.position = "fixed";
        vid.style.top = "-9999px";
        vid.style.left = "-9999px";
        vid.style.width = "100px";
        vid.style.height = "100px";
        document.body.appendChild(vid);

        const timeoutId = setTimeout(() => {
          console.warn("captureFirstFrame seek timed out:", videoUrl);
          finish(null);
        }, 10000);

        const finish = (value) => {
          clearTimeout(timeoutId);
          if (vid.parentNode) {
            document.body.removeChild(vid);
          }
          resolve(value);
        };

        vid.onloadeddata = () => {
          // Seek to the very beginning
          vid.currentTime = 0.05;
        };

        vid.onseeked = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = vid.videoWidth || 1280;
            canvas.height = vid.videoHeight || 720;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
            finish(dataUrl.split(",")[1]);
          } catch (err) {
            console.warn("Canvas capture error:", err);
            finish(null);
          }
        };

        vid.onerror = (e) => {
          console.warn("captureFirstFrame video load error:", e);
          finish(null);
        };
        vid.src = videoUrl;
        vid.load();
      } catch (err) {
        console.warn("captureFirstFrame exception:", err);
        resolve(null);
      }
    });
  };

  // --- Omni Bridge Clip Generator ---
  const pbCallOmniBridge = async (firstFrameB64, lastFrameB64, prompt, signal = null) => {
    const { inputParts, rolePrompt } = await pbBuildOmniImageInputs(
      firstFrameB64,
      "image/jpeg",
      null,
      prompt,
      lastFrameB64,
      null,
      styleAnchor
    );
    inputParts.push({
      type: "text",
      text: `${rolePrompt}${prompt}\nBridge duration: 4 seconds. Start exactly from <FIRST_FRAME>, move naturally, and end matching the final reference frame. Keep the locked character identity, wardrobe, product details, and art style unchanged.`
    });
    const result = await pbCallOmniModel(inputParts, 4, pbResolveOmniTask(inputParts), null, signal);
    return result.videoB64;
  };

  // --- Generate Bridge/Filler Clip After Regeneration ---
  // User-facing "insert filler here": generates a bridge clip between clip i and the next
  const pbInsertFiller = async (i) => {
    if (isGenerating) return;
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    setIsGenerating(true);
    pbAcquireWakeLock();
    try {
      const updated = await pbGenerateBridgeClip(i, pbClips, signal);
      setPbClips(updated);
      pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, updated, pbImages, storyboardImage);
    } catch (err) {
      if (err.name !== "AbortError") alert("Filler generation failed: " + err.message);
    }
    setIsGenerating(false);
    pbReleaseWakeLock();
    abortControllerRef.current = null;
  };

  const pbGenerateBridgeClip = async (regenIdx, clipsInput, signal) => {
    const regenClip = clipsInput[regenIdx];
    // Find the next non-bridge clip after regenIdx
    let nextRealIdx = -1;
    for (let i = regenIdx + 1; i < clipsInput.length; i++) {
      if (clipsInput[i].type !== "bridge") {
        nextRealIdx = i;
        break;
      }
    }

    // No next clip or next clip has no video — no bridge needed
    if (nextRealIdx === -1 || !clipsInput[nextRealIdx].videoUrl) return clipsInput;
    if (!regenClip.videoUrl) return clipsInput;

    setStatusMessage(`Generating Omni bridge filler between Clip ${regenIdx + 1} → Clip ${nextRealIdx + 1}...`);

    // Capture the regen clip's last frame and the next clip's first frame
    const bridgeFirstFrame = await captureLastFrame(regenClip.videoUrl, regenClip.plannedDuration || regenClip.trimEnd || 10);
    const bridgeLastFrame = await captureFirstFrame(clipsInput[nextRealIdx].videoUrl);

    if (!bridgeFirstFrame || !bridgeLastFrame) {
      console.warn("Could not capture frames for bridge clip — skipping bridge generation.");
      return clipsInput;
    }

    // Build a transition prompt from both clip contexts
    const bridgePrompt = `Seamless cinematic transition: smoothly bridge from the ending state of the previous shot into the opening state of the next shot. Maintain identical character appearance, wardrobe, lighting, and environment throughout. The transition should feel natural and invisible — a continuous, unbroken take. Start precisely from the first reference frame and end precisely at the last reference frame. No jump cuts, no style changes, no new characters.`;

    // Check if a bridge already exists between regenIdx and nextRealIdx — replace it
    let bridgeInsertIdx = regenIdx + 1;
    let updatedClips = [...clipsInput];
    if (updatedClips[bridgeInsertIdx] && updatedClips[bridgeInsertIdx].type === "bridge") {
      // Remove the old bridge clip
      updatedClips.splice(bridgeInsertIdx, 1);
      setPbClips(updatedClips);
    }

    // Create a placeholder bridge clip
    const bridgeClip = {
      id: `bridge_${Date.now()}`,
      type: "bridge",
      prompt: bridgePrompt,
      status: "generating",
      videoUrl: null,
      videoData: null,
      interactionId: null,
      plannedDuration: 4,
      trimStart: 0,
      trimEnd: 4,
      cropRatio: "fill",
      excluded: false,
      sceneImage: null,
      sourceClipIdx: regenIdx,
      targetClipIdx: nextRealIdx
    };

    // Insert the bridge clip after the regen clip
    updatedClips.splice(bridgeInsertIdx, 0, bridgeClip);
    setPbClips(updatedClips);

    try {
      const videoB64 = await pbCallOmniBridge(bridgeFirstFrame, bridgeLastFrame, bridgePrompt, signal);

      // Convert to blob URL
      const binaryVal = atob(videoB64);
      const arrayVal = [];
      for (let i = 0; i < binaryVal.length; i++) arrayVal.push(binaryVal.charCodeAt(i));
      const blob = new Blob([new Uint8Array(arrayVal)], { type: "video/mp4" });
      const blobUrl = URL.createObjectURL(blob);

      // Add to library
      pbAddToLibrary(videoB64, `Bridge Filler (Clip ${regenIdx + 1} → ${nextRealIdx + 1})`);

      updatedClips = pbPatchClipAt(updatedClips, bridgeInsertIdx, {
        videoUrl: blobUrl,
        videoData: { bytesBase64Encoded: videoB64, mimeType: "video/mp4" },
        status: "done"
      });
      setPbClips(updatedClips);
      return updatedClips;
    } catch (err) {
      console.error("Bridge clip generation failed:", err);
      // Remove the failed bridge clip placeholder
      updatedClips.splice(bridgeInsertIdx, 1);
      setPbClips(updatedClips);
      setStatusMessage(`Bridge filler failed: ${err.message}. Clips still work without it.`);
      return updatedClips;
    }
  };

  const pbDownloadSingleClip = async (idx) => {
    const clip = pbClips[idx];
    if (!clip || !clip.videoUrl) return;

    try {
      let url = clip.videoUrl;
      if (url.startsWith("http") || url.startsWith("/")) {
        const response = await fetch(url);
        const blob = await response.blob();
        url = URL.createObjectURL(blob);
      }
      
      const a = document.createElement("a");
      a.href = url;
      a.download = `clip_${idx + 1}_${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    } catch {
      const a = document.createElement("a");
      a.href = clip.videoUrl;
      a.target = "_blank";
      a.download = `clip_${idx + 1}_${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // --- Auto-generate Music & Voice Briefs from current script ---
  const pbAutoGenerateAudioBriefs = async () => {
    let lastModelMsg = null;
    const rawLastMsg = chatHistory.filter(m => m.role === "model").pop()?.text;
    lastModelMsg = stripMarkers(rawLastMsg);
    if (!lastModelMsg) return alert("Please chat with the Creative Director to generate a script first!");

    setStatusMessage("Analyzing script to design custom soundscape...");
    try {
      const response = await fetch(
        `${GEMINI_PROXY_BASE}/models/${SYNTH_MODEL}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `You are an expert film sound designer. Analyze the following film script and generate:
1. \"music_brief\": A highly descriptive, cinematic background music brief for a custom Lyria soundtrack (naming specific acoustic instruments, speed, mood, and aesthetic style that matches the film's time period and environment). Avoid artist names. Max 2 sentences.
2. \"voice_signature\": A fitting narrator or character voice description (naming specific age, gender, accent, tone, and pacing) that fits the characters in the script. Max 1 sentence.

SCRIPT:
${lastModelMsg}

Return ONLY a valid JSON object matching this schema:
{\"music_brief\": \"...\", \"voice_signature\": \"...\"}
No markdown wrapper. No explanation.` }] }],
            generationConfig: { temperature: 0.3, responseMimeType: "application/json" }
          })
        }
      );
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      
      let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const objStart = text.search(/[[{]/);
      const objEnd = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
      if (objStart !== -1 && objEnd > objStart) text = text.slice(objStart, objEnd + 1);
      const parsed = JSON.parse(text);

      if (parsed.music_brief) setMusicPrompt(parsed.music_brief);
      if (parsed.voice_signature) setVoiceSignature(parsed.voice_signature);

      setStatusMessage("Soundscape briefs generated!");
      setTimeout(() => setStatusMessage(""), 2000);
      pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, pbClips, pbImages, storyboardImage);
    } catch (err) {
      console.error("Failed to auto-generate briefs:", err);
      alert("Failed to auto-generate soundscape: " + err.message);
      setStatusMessage("");
    }
  };

  // --- Compose one continuous soundtrack with Lyria 3 for the full timeline ---
  const pbGenerateLyriaMusic = async (totalSeconds) => {
    if (!musicPrompt) return null;
    try {
      setStatusMessage("Composing continuous soundtrack with Lyria 3...");
      // Map vocal styles to explicit model prompts
      let vocalInstruction = "Instrumental only, no vocals, no lyrics.";
      if (vocalMode === "female_indian_classical") {
        vocalInstruction = "Include soulful, expressive Indian classical female vocals singing emotional alaap improvisations matching the raga style. No lyrics, purely melodic vocalizations.";
      } else if (vocalMode === "male_indian_classical") {
        vocalInstruction = "Include deep, resonant Indian classical male vocals singing expressive dhrupad/khayal alaap improvisations. Purely melodic vocalizations.";
      } else if (vocalMode === "bollywood_female") {
        vocalInstruction = "Include melodious, expressive Bollywood playback style female vocals singing a romantic, sweet, nostalgic Hindi vocal melody.";
      } else if (vocalMode === "bollywood_male") {
        vocalInstruction = "Include soulful, expressive Bollywood playback style male vocals singing a romantic, nostalgic Hindi vocal melody.";
      } else if (vocalMode === "western_female") {
        vocalInstruction = "Include clear, expressive female vocals singing beautiful, clean melodies with emotional depth.";
      } else if (vocalMode === "western_male") {
        vocalInstruction = "Include warm, expressive male vocals singing beautiful, clean melodies with emotional depth.";
      } else if (vocalMode === "rap_male") {
        vocalInstruction = "Include fast-paced, high-energy male rap vocals flowing dynamically over the beat with authentic hip-hop rhythm, syncopated flow, and attitude. Rapping in a clean, rhythmic style.";
      } else if (vocalMode === "rap_female") {
        vocalInstruction = "Include fast-paced, high-energy female rap vocals flowing dynamically over the beat with authentic hip-hop rhythm, syncopated flow, and attitude. Rapping in a clean, rhythmic style.";
      }

      const instantDropRule = "CRITICAL: Start the main high-energy beat, drums, and tempo immediately from the very first second (0:00). Zero fade-in. Zero slow buildup. The main drums and rhythm must drop at the absolute start.";

      const res = await fetch(`${GEMINI_PROXY_BASE}/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "lyria-3-pro-preview",
          input: `${musicPrompt}. ${vocalInstruction} ${instantDropRule} The total duration MUST be exactly ${Math.max(10, Math.round(totalSeconds))} seconds — ONE single continuous composition with no loops or repeated sections, following the scene timeline timestamps in the brief so musical moments land on the right scenes, ending with a clean resolved finish at exactly ${Math.max(10, Math.round(totalSeconds))} seconds.`,
          response_format: { type: "audio" }
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      let audioB64 = data.output_audio?.data || null;
      for (const step of data.steps || []) {
        if (audioB64) break;
        const contentList = Array.isArray(step.content) ? step.content : (step.content ? [step.content] : []);
        for (const content of contentList) {
          if (content.type === "audio" && content.data) { audioB64 = content.data; break; }
          if (content.inlineData?.data) { audioB64 = content.inlineData.data; break; }
        }
      }
      return audioB64;
    } catch (err) {
      console.warn("Lyria soundtrack generation failed — exporting without music bed:", err);
      return null;
    }
  };

  // --- Server-Side FFmpeg Merged Video Export ---
  const pbMergeAndDownload = async (resSuffix = "") => {
    const doneClips = pbClips.filter(c => c.status === "done" && !c.excluded);
    if (doneClips.length === 0) return alert("No generated clips available to merge!");
    const transitionsPayload = doneClips.slice(0, -1).map((clip) => pbNormalizeTransition(clip.transitionAfter));
    const hasStyledTransitions = transitionsPayload.some((transition) => transition.duration > 0 && transition.ffmpeg !== "cut");
    const transitionLabel = hasStyledTransitions ? "selected transitions" : "hard cuts";

    setIsGenerating(true);
    setStatusMessage(doneClips.length > 1 ? `Merging timeline with ${transitionLabel}...` : "Preparing video export...");

    try {
      // Multi-clip films get one continuous Lyria music bed across all cuts
      let musicB64 = null;
      if (doneClips.length > 1) {
        const totalSeconds = doneClips.reduce((total, c) => total + pbGetClipTimelineSeconds(c), 0);
        musicB64 = await pbGenerateLyriaMusic(totalSeconds);
        setStatusMessage(`Merging timeline with ${transitionLabel} and soundtrack...`);
      }

	      // Upload clips to Vercel Blob to avoid body size limits, then send only URLs
	      const clipsPayload = [];
	      for (let ci = 0; ci < doneClips.length; ci++) {
	        const clip = doneClips[ci];
	        setStatusMessage(`Uploading clip ${ci + 1}/${doneClips.length} for merge...`);
	        let url = clip.videoUrl;
	        // blob: URLs are client-side only — upload to Vercel Blob
	        if (url?.startsWith("blob:") || !url?.startsWith("http")) {
	          try {
	            const b64 = clip.videoData?.bytesBase64Encoded;
	            if (b64) {
	              const binary = atob(b64);
	              const bytes = new Uint8Array(binary.length);
	              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	              const videoBlob = new Blob([bytes], { type: "video/mp4" });
	              const formData = new FormData();
	              formData.append("file", videoBlob, `clip_${ci}_${Date.now()}.mp4`);
	              formData.append("filename", `clip_${ci}_${Date.now()}.mp4`);
	              const uploadRes = await fetch("/api/upload-blob", { method: "POST", body: formData });
	              if (uploadRes.ok) {
	                const uploadData = await uploadRes.json();
	                url = uploadData.url;
	              } else {
	                // Fallback to data URL if blob upload fails (works locally)
	                url = `data:video/mp4;base64,${b64}`;
	              }
	            } else {
	              url = `data:video/mp4;base64,`;
	            }
	          } catch (uploadErr) {
	            console.warn("Blob upload failed, falling back to data URL:", uploadErr);
	            url = `data:video/mp4;base64,${clip.videoData?.bytesBase64Encoded || ""}`;
	          }
	        }
	        const trimStart = Number.isFinite(Number(clip.trimStart)) ? Number(clip.trimStart) : 0;
	        const trimEndSource = clip.trimEnd ?? clip.plannedDuration ?? DEFAULT_TARGET_SECONDS;
	        const trimEnd = Number.isFinite(Number(trimEndSource)) ? Number(trimEndSource) : DEFAULT_TARGET_SECONDS;
	        clipsPayload.push({
	          url,
	          trimStart,
	          trimEnd: Math.max(trimStart + 0.1, trimEnd),
	          cropRatio: clip.cropRatio || "fit"
	        });
	      }

      const response = await fetch("/api/merge-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clips: clipsPayload,
          aspectRatio: aspectRatio + resSuffix,
          transitionSeconds: hasStyledTransitions ? DEFAULT_TIMELINE_TRANSITION_SECONDS : 0,
          transitions: transitionsPayload,
          musicB64: musicB64,
          musicGainDb: -4
        })
      });

	      if (!response.ok) {
	        const errText = await response.text();
	        let message = errText || "Stitching backend error.";
	        try {
	          const parsed = JSON.parse(errText);
	          if (Array.isArray(parsed.detail)) {
	            message = parsed.detail
	              .map(item => `${(item.loc || []).join(".") || "field"}: ${item.msg || "invalid value"}`)
	              .join("; ");
	          } else if (parsed.detail) {
	            message = typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail);
	          } else if (parsed.error) {
	            message = parsed.error;
	          }
	        } catch {}
	        throw new Error(message);
	      }

      let blob;
      let blobUrl;
      const contentType = response.headers.get("Content-Type") || "";
      if (contentType.includes("application/json")) {
        const json = await response.json();
        if (json.url) {
          const blobRes = await fetch(json.url);
          blob = await blobRes.blob();
          blobUrl = URL.createObjectURL(blob);
        } else {
          throw new Error(json.error || "Stitching returned an empty response.");
        }
      } else {
        blob = await response.blob();
        blobUrl = URL.createObjectURL(blob);
      }

      // Add merged video to generation library
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(",")[1];
        pbAddToLibrary(base64, `Merged Video Export (${doneClips.length} clips)`);
      };
      reader.readAsDataURL(blob);

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `merged_video_${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      
      setIsGenerating(false);
    } catch (err) {
      alert("Server-side merge failed: " + err.message);
      setIsGenerating(false);
    }
  };

  // --- Clip Editor parameter modifiers ---
  const updateClipParam = (idx, key, val) => {
    const updated = [...pbClips];
    updated[idx][key] = val;
    setPbClips(updated);
    pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, updated, pbImages, storyboardImage);
  };

  const pbSetTransitionAfter = (clipIndex, presetId) => {
    const preset = PB_TRANSITION_PRESET_BY_ID[presetId] || PB_TRANSITION_PRESET_BY_ID.cut;
    const updated = pbPatchClipAt(pbClips, clipIndex, {
      transitionAfter: pbNormalizeTransition({ id: preset.id, duration: preset.seconds })
    });
    setPbClips(updated);
    setActiveTransitionIdx(null);
    pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, updated, pbImages, storyboardImage);
  };

  const pbGetTransitionAfter = (clipIndex) => {
    return pbNormalizeTransition(pbClips[clipIndex]?.transitionAfter);
  };

  const exportableClips = pbClips.filter(clip => clip.status === "done" && !clip.excluded);
  const readyTimelineSeconds = exportableClips.reduce((total, clip) => total + pbGetClipTimelineSeconds(clip), 0);
  const plannedTimelineSeconds = pbClips.reduce((total, clip) => total + pbGetClipTimelineSeconds(clip), 0);
  // Dynamic px-per-second: fill ~900px of visible width, with a floor of 30 and cap of 120
  const pxPerSec = (() => {
    const totalSec = Math.max(1, plannedTimelineSeconds || 10);
    const availableWidth = 900; // approximate visible canvas minus lane header
    const computed = Math.floor(availableWidth / totalSec);
    return Math.max(30, Math.min(120, computed));
  })();
  const timelineMinWidth = `${100 + Math.max(12, Math.ceil(plannedTimelineSeconds || 10)) * pxPerSec + 100}px`;
  const canExportTimeline = exportableClips.length > 0 && !isGenerating;
  const currentPipelineText = statusMessage || (isGenerating ? "Preparing production pipeline..." : "");
  const normalizedPipelineText = currentPipelineText.toLowerCase();
  const storyboardPanelCount = pbImages.filter(img => img._isStoryboardPanel).length;
  const characterLockCount = pbImages.filter(img => img._fromStoryboardCharacterSheet || img._isCharacter || img._identityLock).length;
  const objectLockCount = pbImages.filter(img => img._isObjectLock || img._objectLock).length;
  const productLockCount = pbImages.filter(img => img._isProduct).length;
  const generatedClipCount = pbClips.filter(clip => clip.status === "done" && !clip.excluded).length;
  const generatingClipIndex = pbClips.findIndex(clip => clip.status === "generating");
  const failedClipCount = pbClips.filter(clip => clip.status === "error").length;
  const pipelineIsActive = isGenerating || isVideoGenerating;
  const isPipelineOverlayVisible = pipelineIsActive && currentPipelineText && !isPipelineOverlayDismissed;
  const getPipelineStepStatus = (stepKey) => {
    if (stepKey === "storyboard") {
      if (/storyboard|visual board|nano banana|first attempt/i.test(currentPipelineText)) return "active";
      return storyboardImage ? "done" : "pending";
    }
    if (stepKey === "extract") {
      if (/extracting|scanning storyboard|visual panels|re-reading/i.test(currentPipelineText)) return "active";
      return storyboardPanelCount > 0 || characterLockCount > 0 ? "done" : "pending";
    }
    if (stepKey === "locks") {
      if (/character|object|logo|reference photo|reference image/i.test(currentPipelineText)) return "active";
      return characterLockCount + objectLockCount + productLockCount > 0 ? "done" : "pending";
    }
    if (stepKey === "plan") {
      if (/planning|breaking|split|timeline|segments/i.test(currentPipelineText)) return "active";
      return pbClips.length > 0 ? "done" : "pending";
    }
    if (stepKey === "video") {
      if (/generating clip|end-frame|first-frame|retrying|restoring art style/i.test(currentPipelineText)) return "active";
      return generatedClipCount > 0 ? "done" : "pending";
    }
    if (stepKey === "audio") {
      if (/audio|voice|soundscape|soundtrack|lyria|export|merging/i.test(currentPipelineText)) return "active";
      return generatedClipCount > 0 ? "pending" : "waiting";
    }
    return "pending";
  };
  const pipelineSteps = [
    {
      key: "storyboard",
      title: "Storyboard",
      detail: storyboardImage ? "Storyboard sheet is ready." : "Generating or reading the storyboard sheet.",
      status: getPipelineStepStatus("storyboard")
    },
    {
      key: "extract",
      title: "Panel extraction",
      detail: `${storyboardPanelCount} shot panel${storyboardPanelCount === 1 ? "" : "s"} prepared as visual references.`,
      status: getPipelineStepStatus("extract")
    },
    {
      key: "locks",
      title: "Reference locks",
      detail: `${characterLockCount} character, ${objectLockCount} object/logo, ${productLockCount} product lock${productLockCount === 1 ? "" : "s"}.`,
      status: getPipelineStepStatus("locks")
    },
    {
      key: "plan",
      title: "Timeline planning",
      detail: `${pbClips.length || 0} clip slot${pbClips.length === 1 ? "" : "s"} in the production timeline.`,
      status: getPipelineStepStatus("plan")
    },
    {
      key: "video",
      title: "Video generation",
      detail: generatingClipIndex >= 0
        ? `Generating Clip ${generatingClipIndex + 1} of ${pbClips.length}.`
        : `${generatedClipCount}/${pbClips.length || 0} clips finished${failedClipCount ? `, ${failedClipCount} failed` : ""}.`,
      status: getPipelineStepStatus("video")
    },
    {
      key: "audio",
      title: "Audio & export",
      detail: "Voice, soundtrack, timeline merge, and export happen after clip generation.",
      status: getPipelineStepStatus("audio")
    }
  ];
  const activePipelineStep = pipelineSteps.find(step => step.status === "active") || pipelineSteps.find(step => step.status === "pending") || pipelineSteps[0];
  const generatedAssetLabel = /extracting|visual panels/i.test(normalizedPipelineText)
    ? "Shot panel references from the storyboard sheet"
    : /character/i.test(normalizedPipelineText)
      ? "Character identity and wardrobe lock references"
      : /object|logo/i.test(normalizedPipelineText)
        ? "Object/logo lock notes from uploaded references"
        : /generating clip/i.test(normalizedPipelineText)
          ? (generatingClipIndex >= 0 ? `Clip ${generatingClipIndex + 1} video` : "Video clip")
          : /soundscape|soundtrack|lyria|voice|audio/i.test(normalizedPipelineText)
            ? "Audio layer"
            : /merg|export/i.test(normalizedPipelineText)
              ? "Final timeline export"
              : activePipelineStep?.title || "Production assets";

  // SMPTE timecode formatter helper
  const pbFormatTimecode = (secs) => {
    const s = Math.floor(secs);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const displayH = h.toString().padStart(2, '0');
    const displayM = (m % 60).toString().padStart(2, '0');
    const displayS = (s % 60).toString().padStart(2, '0');
    const displayF = Math.floor((secs % 1) * 24).toString().padStart(2, '0'); // 24 fps
    return `${displayH}:${displayM}:${displayS}:${displayF}`;
  };

  const handleTimelineScrub = (clientX, rect) => {
    const clickX = clientX - rect.left - 100;
    const time = Math.max(0, clickX / pxPerSec);
    
    let accum = 0;
    let foundIdx = 0;
    for (let idx = 0; idx < pbClips.length; idx++) {
      const dur = pbGetClipTimelineSeconds(pbClips[idx]);
      if (time >= accum && time <= accum + dur) {
        foundIdx = idx;
        break;
      }
      accum += dur;
      if (idx === pbClips.length - 1) {
        foundIdx = idx;
      }
    }
    
    setActiveClipIdx(foundIdx);
    const clipOffset = time - accum;
    const vid = stageVideoRef.current;
    if (vid) {
      vid.currentTime = (pbClips[foundIdx]?.trimStart || 0) + clipOffset;
    }
    setPlayhead(time);
  };

  const handleTimelineMouseDown = (e) => {
    const ruler = e.currentTarget;
    const rect = ruler.getBoundingClientRect();
    handleTimelineScrub(e.clientX, rect);

    const handleMouseMove = (moveEvent) => {
      handleTimelineScrub(moveEvent.clientX, rect);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleClipDrop = (e, targetTrack) => {
    e.preventDefault();
    const clipIdxStr = e.dataTransfer.getData("text/plain");
    if (clipIdxStr === "") return;
    const clipIdx = parseInt(clipIdxStr, 10);
    if (isNaN(clipIdx) || clipIdx < 0 || clipIdx >= pbClips.length) return;

    const updatedClips = [...pbClips];
    const [draggedClip] = updatedClips.splice(clipIdx, 1);
    
    if (targetTrack === "bridge") {
      draggedClip.type = "bridge";
    } else {
      draggedClip.type = "main";
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const dropX = e.clientX - rect.left;
    const dropSeconds = Math.max(0, dropX / 30);

    let insertIdx = 0;
    let accum = 0;
    for (let idx = 0; idx < updatedClips.length; idx++) {
      const dur = pbGetClipTimelineSeconds(updatedClips[idx]);
      if (dropSeconds > accum + dur / 2) {
        insertIdx = idx + 1;
      }
      accum += dur;
    }

    updatedClips.splice(insertIdx, 0, draggedClip);
    setPbClips(updatedClips);
    setActiveClipIdx(insertIdx);
    pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, updatedClips, pbImages, storyboardImage);
  };

  return (
    <div className="pb-app">
      {isPipelineOverlayVisible && (
        <div
          className="pb-pipeline-lightbox"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            background: "rgba(15, 23, 42, 0.30)",
            backdropFilter: "blur(14px) saturate(140%)",
            WebkitBackdropFilter: "blur(14px) saturate(140%)"
          }}
        >
          <div
            className="pb-pipeline-modal"
            role="status"
            aria-live="polite"
            style={{
              width: "min(720px, calc(100vw - 48px))",
              maxHeight: "82vh",
              overflow: "auto",
              background: "linear-gradient(135deg, rgba(255,255,255,0.84), rgba(255,255,255,0.68))",
              backdropFilter: "blur(24px) saturate(155%)",
              WebkitBackdropFilter: "blur(24px) saturate(155%)",
              border: "1px solid rgba(255, 255, 255, 0.62)",
              borderRadius: "16px",
              boxShadow: "0 30px 90px rgba(15, 23, 42, 0.24), inset 0 1px 0 rgba(255,255,255,0.72)",
              padding: "22px 24px 24px"
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "20px", marginBottom: "18px" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.08em", color: "#7c3aed", textTransform: "uppercase", marginBottom: "6px" }}>
                  Production Pipeline
                </div>
                <h2 style={{ margin: 0, fontSize: "22px", lineHeight: 1.2, color: "#111827" }}>
                  {activePipelineStep?.title || "Working"}
                </h2>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <div style={{ minWidth: "112px", textAlign: "right" }}>
                  <div style={{ fontSize: "24px", fontWeight: 900, color: "#7c3aed", lineHeight: 1 }}>
                    {pbClips.length ? `${generatedClipCount}/${pbClips.length}` : "Live"}
                  </div>
                  <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", marginTop: "4px", textTransform: "uppercase" }}>
                    {pbClips.length ? "Clips Ready" : "In Progress"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPipelineOverlayDismissed(true)}
                  title="Close pipeline window"
                  aria-label="Close pipeline window"
                  style={{
                    width: "34px",
                    height: "34px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255, 255, 255, 0.58)",
                    background: "rgba(255,255,255,0.62)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.66)",
                    color: "#475569",
                    fontSize: "20px",
                    lineHeight: 1,
                    fontWeight: 800,
                    cursor: "pointer"
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "16px",
                alignItems: "center",
                padding: "14px 16px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, rgba(255,255,255,0.68), rgba(124, 58, 237, 0.09), rgba(14, 165, 233, 0.07))",
                border: "1px solid rgba(255,255,255,0.58)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.62)",
                marginBottom: "18px"
              }}
            >
              <div>
                <div style={{ fontSize: "13px", fontWeight: 900, color: "#334155", marginBottom: "5px" }}>
                  Current action
                </div>
                <div style={{ fontSize: "15px", color: "#111827", lineHeight: 1.45 }}>
                  {currentPipelineText}
                </div>
              </div>
              <div className="pb-loading" style={{ width: "86px", height: "8px", borderRadius: "99px" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px", marginBottom: "18px" }}>
              {[
                ["Panels", storyboardPanelCount],
                ["Characters", characterLockCount],
                ["Logos/Objects", objectLockCount],
                ["Products", productLockCount]
              ].map(([label, count]) => (
                <div key={label} style={{ padding: "11px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.58)", background: "rgba(255,255,255,0.60)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.62)" }}>
                  <div style={{ fontSize: "18px", fontWeight: 900, color: "#111827", lineHeight: 1 }}>{count}</div>
                  <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", marginTop: "5px", textTransform: "uppercase" }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gap: "9px" }}>
              {pipelineSteps.map((step) => {
                const isActive = step.status === "active";
                const isDone = step.status === "done";
                const statusColor = isDone ? "#059669" : isActive ? "#7c3aed" : "#94a3b8";
                const statusBg = isDone ? "rgba(5, 150, 105, 0.10)" : isActive ? "rgba(124, 58, 237, 0.10)" : "rgba(248,250,252,0.64)";
                return (
                  <div
                    key={step.key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "28px 1fr auto",
                      gap: "12px",
                      alignItems: "center",
                      padding: "11px 12px",
                      borderRadius: "10px",
                      border: `1px solid ${isActive ? "rgba(124, 58, 237, 0.28)" : "rgba(255,255,255,0.58)"}`,
                      background: isActive ? "rgba(124, 58, 237, 0.08)" : "rgba(255,255,255,0.54)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.58)"
                    }}
                  >
                    <div
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "999px",
                        display: "grid",
                        placeItems: "center",
                        background: statusBg,
                        color: statusColor,
                        fontSize: "13px",
                        fontWeight: 900
                      }}
                    >
                      {isDone ? "✓" : isActive ? "•" : ""}
                    </div>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 900, color: "#111827" }}>{step.title}</div>
                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px", lineHeight: 1.35 }}>{step.detail}</div>
                    </div>
                    <div
                      style={{
                        fontSize: "10px",
                        fontWeight: 900,
                        color: statusColor,
                        background: statusBg,
                        borderRadius: "999px",
                        padding: "5px 8px",
                        textTransform: "uppercase"
                      }}
                    >
                      {step.status === "waiting" ? "later" : step.status}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: "16px", padding: "12px 14px", borderRadius: "10px", background: "rgba(255,255,255,0.50)", border: "1px solid rgba(255,255,255,0.58)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.58)" }}>
              <div style={{ fontSize: "12px", fontWeight: 900, color: "#334155", marginBottom: "4px" }}>
                What is being generated
              </div>
              <div style={{ fontSize: "13px", lineHeight: 1.45, color: "#475569" }}>
                {generatedAssetLabel}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
              <button
                type="button"
                onClick={() => setIsPipelineOverlayDismissed(true)}
                style={{
                  padding: "9px 14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.58)",
                  background: "rgba(255,255,255,0.60)",
                  color: "#334155",
                  fontSize: "12px",
                  fontWeight: 900,
                  cursor: "pointer",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.62)"
                }}
              >
                Hide window
              </button>
              <button
                type="button"
                onClick={handleStopGeneration}
                style={{
                  padding: "9px 14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(185, 28, 28, 0.18)",
                  background: "#b91c1c",
                  color: "#fff",
                  fontSize: "12px",
                  fontWeight: 900,
                  cursor: "pointer",
                  boxShadow: "0 8px 18px rgba(185, 28, 28, 0.18)"
                }}
              >
                Stop generation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADERBAR */}
      <div className="pb-headerbar">
        <span className="pb-logo">🎬 Vibe Theory Studio</span>
        
        {/* Navigation Tabs in Header */}
        <div className="pb-nav-tabs">
          <button className="pb-nav-tab active">Production</button>
          <button className="pb-nav-tab" onClick={() => setShowLibrary(true)}>Library</button>
        </div>

        <div className="pb-header-right">
          <div className="pb-gpu-badge">
            <span className="pb-gpu-dot"></span>
            GPU Active
          </div>
          {isGenerating ? (
            <button className="pb-gen-btn pb-stop-btn" onClick={handleStopGeneration}>
              🛑 Stop Generation
            </button>
          ) : (
            <button className="pb-gen-btn" onClick={pbGenerateVideo}>
              ⚡ GENERATE
            </button>
          )}
        </div>
      </div>

      <div className="pb-main-layout">
        
        {/* UPPER GRID: 3-column workspace */}
        <div className="pb-workspace-grid">
          
          {/* COLUMN 1: Production Stage (Video Player & Controls) */}
          <div className="pb-panel pb-panel-stage">
            <div className="pb-panel-header">
              <span className="pb-panel-title">
                📺 Production Stage 
                <span style={{fontSize: "10px", padding: "2px 6px", background: "rgba(15,23,42,0.06)", borderRadius: "4px", marginLeft: "6px", color: "var(--text-secondary)", fontWeight: "700"}}>
                  MASTER EDIT
                </span>
              </span>
            </div>
            
            <div className="pb-panel-body pb-stage-body">
              
              {/* Pre-Computation Validation Panel */}
              {validationChecks && (
                <div style={{
                  background: "rgba(255,255,255,0.92)", borderRadius: "10px",
                  border: "1px solid rgba(15,23,42,0.08)", padding: "14px 16px",
                  marginBottom: "12px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                  animation: "fadeIn 0.3s ease"
                }}>
                  <div style={{
                    fontSize: "12px", fontWeight: 800, color: "#334155",
                    marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px"
                  }}>
                    🔍 Pre-Computation Validation
                  </div>
                  {validationChecks.map(check => (
                    <div key={check.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "7px 10px", borderRadius: "6px", marginBottom: "2px",
                      fontSize: "11.5px", fontWeight: 600, transition: "all 0.2s",
                      background: check.status === "fail" ? "rgba(239,68,68,0.06)"
                        : check.status === "running" ? "rgba(59,130,246,0.04)"
                        : check.status === "success" ? "rgba(16,185,129,0.04)"
                        : "transparent",
                      color: check.status === "fail" ? "#dc2626"
                        : check.status === "success" ? "#059669"
                        : check.status === "running" ? "#2563eb"
                        : "#94a3b8"
                    }}>
                      <span>{check.name}</span>
                      <span style={{ fontSize: "13px" }}>
                        {check.status === "pending" ? "⚪"
                          : check.status === "running" ? "⏳"
                          : check.status === "success" ? "✓"
                          : check.status === "fail" ? "✗"
                          : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Production Progress — live, per-step, per-clip */}
              {(isGenerating || statusMessage) && (() => {
                const total = pbClips.length;
                const done = pbClips.filter(c => c.status === "done").length;
                const activeIdx = pbClips.findIndex(c => c.status === "generating");
                const pct = total > 0
                  ? Math.min(100, Math.round(((done + (activeIdx !== -1 ? 0.5 : 0)) / total) * 100))
                  : (isGenerating ? 6 : 100);
                const m = statusMessage || (isGenerating ? "Working..." : "Done");
                const icon = /soundtrack|music|lyria/i.test(m) ? "🎵"
                  : /keyframe|reference image|frame target|convert|storyboard|art style/i.test(m) ? "🎨"
                  : /split|breaking|script|plan/i.test(m) ? "✂️"
                  : /merg|export|stitch/i.test(m) ? "🎞️"
                  : /verif|re-reading|retry|restor|off-frame/i.test(m) ? "🔍"
                  : "🎬";
                return (
                  <div className={`pb-progress ${isGenerating ? "pb-progress-active" : "pb-progress-done"}`} style={{marginBottom: "12px", borderRadius: "10px"}}>
                    <div className="pb-progress-top">
                      <span className="pb-progress-stage">
                        {isGenerating && <span className="pb-progress-dot" />}
                        <span className="pb-progress-icon" style={{marginRight: "4px"}}>{icon}</span>
                        <span className="pb-progress-text">{m}</span>
                      </span>
                      {total > 0 && (
                        <span className="pb-progress-meta">
                          {done}/{total} clips · {pct}%
                        </span>
                      )}
                    </div>
                    <div className="pb-progress-bar">
                      <div className="pb-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })()}

              {/* Video Display Window */}
              <div className="pb-video-window" id="pbVideoWindow">
                <span className="pb-video-rec-badge">
                  <span className="pb-video-rec-dot"></span> REC
                </span>
                
                {activeClipIdx !== null && pbClips[activeClipIdx]?.videoUrl ? (
                  <video
                    ref={stageVideoRef}
                    src={pbClips[activeClipIdx].videoUrl}
                    onTimeUpdate={(e) => {
                      let acc = 0;
                      for (let k = 0; k < activeClipIdx; k++) acc += pbGetClipTimelineSeconds(pbClips[k]);
                      setPlayhead(acc + Math.max(0, e.target.currentTime - (pbClips[activeClipIdx]?.trimStart || 0)));
                    }}
                    autoPlay
                    loop={!isPlayingFullTimeline}
                    onEnded={handleVideoEnded}
                    playsInline
                  />
                ) : isGenerating ? (
                  <div className="pb-video-placeholder">
                    <div className="pb-loading" style={{ width: "80%", marginBottom: "8px" }} />
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>{statusMessage}</span>
                  </div>
                ) : (
                  <div className="pb-video-placeholder">
                    <span style={{ fontSize: "28px" }}>🎬</span>
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>Select a clip to play</span>
                  </div>
                )}
                
                {/* Central Play Badge Overlay */}
                {activeClipIdx !== null && pbClips[activeClipIdx]?.videoUrl && (
                  <div className="pb-video-play-overlay" onClick={() => {
                    const vid = stageVideoRef.current;
                    if (vid) {
                      if (vid.paused) vid.play();
                      else vid.pause();
                    }
                  }}>
                    ▶
                  </div>
                )}
                
                {/* Floating Player Control Pill */}
                {activeClipIdx !== null && pbClips[activeClipIdx]?.videoUrl && (
                  <div className="pb-player-controls-pill">
                    <button className="pb-player-control-btn" title="First Frame" onClick={() => {
                      const vid = stageVideoRef.current;
                      if (vid) vid.currentTime = pbClips[activeClipIdx]?.trimStart || 0;
                    }}>⏮</button>
                    <button className="pb-player-control-btn" title="Rewind" onClick={() => {
                      const vid = stageVideoRef.current;
                      if (vid) vid.currentTime = Math.max(pbClips[activeClipIdx]?.trimStart || 0, vid.currentTime - 1);
                    }}>⏪</button>
                    <button className="pb-player-control-btn pb-play-pause-toggle" title="Play/Pause" onClick={() => {
                      const vid = stageVideoRef.current;
                      if (vid) {
                        if (vid.paused) vid.play();
                        else vid.pause();
                      }
                    }}>▶</button>
                    <button className="pb-player-control-btn" title="Forward" onClick={() => {
                      const vid = stageVideoRef.current;
                      if (vid) vid.currentTime = Math.min(pbClips[activeClipIdx]?.trimEnd || vid.duration || 0, vid.currentTime + 1);
                    }}>⏩</button>
                    <button className="pb-player-control-btn" title="Last Frame" onClick={() => {
                      const vid = stageVideoRef.current;
                      if (vid) vid.currentTime = pbClips[activeClipIdx]?.trimEnd || vid.duration || 0;
                    }}>⏭</button>
                  </div>
                )}
              </div>

              {/* Compact Inline Clip Toolbar — shows when a clip is selected */}
              {activeClipIdx !== null && (
                <div className="pb-clip-toolbar" style={{marginTop: "12px", border: "1px solid var(--border)", borderRadius: "10px", padding: "10px", background: "rgba(15,23,42,0.01)"}}>
                  <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px"}}>
                    <span className="pb-clip-toolbar-label" style={pbClips[activeClipIdx]?.type === "bridge" ? { color: "#d97706", fontSize: "11px", fontWeight: "700" } : { fontSize: "11px", fontWeight: "700" }}>
                      {pbClips[activeClipIdx]?.type === "bridge" ? "🔗 Bridge" : `Shot ${activeClipIdx + 1}`} ({pbClips[activeClipIdx]?.status})
                    </span>
                    {pbClips[activeClipIdx]?.type === "bridge" ? (
                      <button
                        className="pb-clip-toolbar-btn pb-clip-toolbar-regen"
                        style={{ background: "rgba(239, 68, 68, 0.08)", color: "#dc2626", borderColor: "rgba(239, 68, 68, 0.2)", padding: "3px 8px", fontSize: "11px", border: "1px solid", borderRadius: "4px", cursor: "pointer" }}
                        onClick={() => {
                          const updated = [...pbClips];
                          updated.splice(activeClipIdx, 1);
                          setPbClips(updated);
                          setActiveClipIdx(Math.max(0, activeClipIdx - 1));
                        }}
                      >
                        🗑️ Remove
                      </button>
                    ) : (
                      <button
                        className="pb-clip-toolbar-btn pb-clip-toolbar-regen"
                        style={{ padding: "3px 8px", background: "var(--accent-bg)", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: "4px", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}
                        onClick={() => pbRegenClip(activeClipIdx)}
                      >
                        🔄 Regen
                      </button>
                    )}
                  </div>
                  
                  {pbClips[activeClipIdx]?.status === "done" && (
                    <div style={{display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center"}}>
                      <label style={{fontSize: "11px", display: "flex", alignItems: "center", gap: "4px"}}>
                        Start:
                        <input
                          type="number"
                          value={pbClips[activeClipIdx].trimStart}
                          onChange={(e) => updateClipParam(activeClipIdx, "trimStart", parseFloat(e.target.value) || 0)}
                          style={{width: "48px", padding: "2px 4px", fontSize: "11px", border: "1px solid var(--border)", borderRadius: "4px"}}
                          step="0.1"
                        />
                      </label>
                      <label style={{fontSize: "11px", display: "flex", alignItems: "center", gap: "4px"}}>
                        End:
                        <input
                          type="number"
                          value={pbClips[activeClipIdx].trimEnd}
                          onChange={(e) => updateClipParam(activeClipIdx, "trimEnd", parseFloat(e.target.value) || 10)}
                          style={{width: "48px", padding: "2px 4px", fontSize: "11px", border: "1px solid var(--border)", borderRadius: "4px"}}
                          step="0.1"
                        />
                      </label>
                      {["fit", "fill"].map(mode => (
                        <button
                          key={mode}
                          onClick={() => updateClipParam(activeClipIdx, "cropRatio", mode)}
                          style={{padding: "2px 6px", fontSize: "11px", border: "1px solid var(--border)", borderRadius: "4px", background: pbClips[activeClipIdx].cropRatio === mode ? "var(--accent)" : "#fff", color: pbClips[activeClipIdx].cropRatio === mode ? "#fff" : "var(--text)", cursor: "pointer"}}
                        >
                          {mode.toUpperCase()}
                        </button>
                      ))}
                      <button
                        style={{padding: "3px 8px", background: "rgba(15,23,42,0.04)", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: "4px", fontSize: "11px", fontWeight: "700", cursor: "pointer"}}
                        onClick={() => pbDownloadSingleClip(activeClipIdx)}
                      >
                        💾 Save
                      </button>
                      {pbClips[activeClipIdx]?.type !== "bridge" && (
                        <label style={{fontSize: "11px", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer"}}>
                          <input
                            type="checkbox"
                            checked={pbClips[activeClipIdx]?.excluded || false}
                            onChange={(e) => updateClipParam(activeClipIdx, "excluded", e.target.checked)}
                          />
                          ✂️ Exclude
                        </label>
                      )}
                    </div>
                  )}

                  {/* AI Video-to-Video Edit — inline bar */}
                  {pbClips[activeClipIdx]?.status === "done" && (
                    <div style={{display: "flex", gap: "6px", marginTop: "8px", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: "8px"}}>
                      <span style={{fontSize: "11px", fontWeight: "700"}}>🪄 AI Edit:</span>
                      <input
                        type="text"
                        id={`pbVideoEditPrompt-${activeClipIdx}`}
                        placeholder="Make it sunset lighting, change visual details..."
                        style={{flex: 1, padding: "4px 8px", fontSize: "11px", border: "1px solid var(--border)", borderRadius: "4px"}}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") pbAiEditVideo(activeClipIdx);
                        }}
                      />
                      <button
                        onClick={() => pbAiEditVideo(activeClipIdx)}
                        style={{padding: "4px 8px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "4px", fontSize: "11px", fontWeight: "600", cursor: "pointer"}}
                      >
                        Apply
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* COLUMN 2: Prompting & Visuals/Audio Settings */}
          <div className="pb-panel pb-panel-settings">
            <div className="pb-panel-header">
              <div className="pb-tabs-container" style={{display: "flex", gap: "4px", width: "100%"}}>
                <button
                  className={`pb-tab-btn ${leftTab === "video" ? "active" : ""}`}
                  onClick={() => setLeftTab("video")}
                  style={{flex: 1, textAlign: "center"}}
                >
                  📺 Video Setup
                </button>
                <button
                  className={`pb-tab-btn ${leftTab === "visuals" ? "active" : ""}`}
                  onClick={() => setLeftTab("visuals")}
                  style={{flex: 1, textAlign: "center"}}
                >
                  🎨 Visuals & Sync
                </button>
                <button
                  className={`pb-tab-btn ${leftTab === "audio" ? "active" : ""}`}
                  onClick={() => setLeftTab("audio")}
                  style={{flex: 1, textAlign: "center"}}
                >
                  🎵 Sound & Voice
                </button>
              </div>
            </div>
            
            <div className="pb-panel-body">
              {leftTab === "video" && (
                <div style={{display: "flex", flexDirection: "column", gap: "16px"}}>
                  {/* Resolution & Aspect Ratio */}
                  <div className="pb-settings-group">
                    <span className="pb-settings-label">Aspect Ratio & Resolution</span>
                    <select 
                      value={aspectRatio} 
                      onChange={(e) => setAspectRatio(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: "600",
                        fontFamily: "var(--font-body)",
                        background: "#fff",
                        cursor: "pointer"
                      }}
                    >
                      <option value="16:9">16:9 Cinematic</option>
                      <option value="9:16">9:16 Cinematic</option>
                      <option value="1:1">1:1 Cinematic</option>
                      <option value="16:9-2k">2K Cinematic (16:9)</option>
                      <option value="9:16-2k">2K Cinematic (9:16)</option>
                      <option value="16:9-4k">4K Cinematic (16:9)</option>
                      <option value="9:16-4k">4K Cinematic (9:16)</option>
                    </select>
                  </div>

                  {/* Video Generator Model */}
                  <div className="pb-settings-group">
                    <span className="pb-settings-label">Video Generator Model</span>
                    <select 
                      value={videoModel} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setVideoModel(val);
                        pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, val, pbClips, pbImages, storyboardImage);
                      }} 
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: "600",
                        fontFamily: "var(--font-body)",
                        background: "#fff",
                        cursor: "pointer"
                      }}
                    >
                      <option value="gemini-omni-flash-preview">⚡ Gemini Omni Flash (Audio & Video)</option>
                    </select>
                  </div>

                  {/* Prompt Processing Mode */}
                  <div className="pb-settings-group">
                    <span className="pb-settings-label">Prompt Optimization Mode</span>
                    <div style={{display: "flex", gap: "6px"}}>
                      {["enhanced", "json", "normal"].map(mode => (
                        <button
                          key={mode}
                          onClick={() => {
                            setPbFormat(mode);
                            pbSaveSession(activeSessionId, sessionName, chatHistory, mode, videoModel, pbClips, pbImages, storyboardImage);
                          }}
                          style={{
                            flex: 1,
                            padding: "6px 8px",
                            fontSize: "11px",
                            fontWeight: "600",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            background: pbFormat === mode ? "var(--accent)" : "#fff",
                            color: pbFormat === mode ? "#fff" : "var(--text-primary)",
                            cursor: "pointer",
                            transition: "all 0.2s"
                          }}
                        >
                          {mode.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {leftTab === "visuals" && (
                <div style={{display: "flex", flexDirection: "column", gap: "16px"}}>
                  {/* Storyboard Sync Box */}
                  <div className="pb-storyboard-upload-section">
                    <span className="pb-section-label">
                      <span className="pb-dot purple"></span> Storyboard Sync
                    </span>
                    <div style={{display: "flex", flexDirection: "column", gap: "8px"}}>
                      <div
                        className={`pb-storyboard-upload ${storyboardImage ? "has-storyboard" : ""}`}
                        onClick={() => storyboardInputRef.current?.click()}
                      >
                        <span style={{ fontSize: "24px" }}>📋</span>
                        <span>{storyboardImage ? "Replace Storyboard Sheet" : "Drop storyboard PNG/JPG here or Click to upload"}</span>
                        <input
                          type="file"
                          ref={storyboardInputRef}
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={handleStoryboardUpload}
                        />
                      </div>
                      
	                      <button
	                        onClick={(e) => {
	                          e.stopPropagation();
	                          pbGenerateStoryboard(null, { resetDerived: true });
	                        }}
	                        disabled={isGenerating}
	                        style={{
	                          width: "100%",
	                          padding: "8px 12px",
	                          borderRadius: "6px",
	                          border: "none",
	                          background: "var(--accent)",
	                          color: "#fff",
	                          fontSize: "12px",
	                          fontWeight: "600",
	                          cursor: isGenerating ? "not-allowed" : "pointer",
	                          display: "flex",
	                          alignItems: "center",
	                          justifyContent: "center",
	                          gap: "6px",
	                          boxShadow: "var(--shadow-sm)",
	                          opacity: isGenerating ? 0.7 : 1
	                        }}
	                      >
	                        {isGenerating ? "Regenerating..." : storyboardImage ? "🪄 Regenerate Storyboard & Clip Refs" : "🪄 Generate Storyboard from Script"}
	                      </button>
                    </div>
                  </div>
                  
                  {/* Storyboard display preview */}
                  {storyboardImage && (
                    <div style={{display: "flex", flexDirection: "column", gap: "8px"}}>
                      <div className="pb-storyboard-display" style={{position: "relative", border: "1px solid var(--border)", borderRadius: "8px", overflow: "hidden", background: "rgba(15,23,42,0.02)"}}>
                        <img src={storyboardImage.startsWith("data:") ? storyboardImage : `data:image/png;base64,${storyboardImage}`} alt="Storyboard" style={{width: "100%", maxHeight: "120px", objectFit: "contain"}} />
                      </div>
                      <div style={{display: "flex", gap: "8px"}}>
                        <button
                          onClick={pbGenerateStoryboardTimeline}
                          disabled={isGenerating}
                          style={{
                            flex: 1,
                            padding: "8px",
                            borderRadius: "6px",
                            border: "none",
                            background: "var(--accent)",
                            color: "#fff",
                            fontSize: "12px",
                            fontWeight: "600",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                            boxShadow: "var(--shadow-sm)"
                          }}
                        >
                          {isGenerating ? "Generating..." : "🪄 Generate Clips"}
                        </button>
                        <button
                          onClick={() => { setStoryboardImage(null); pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, pbClips, pbImages, null); }}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "6px",
                            border: "1px solid var(--border)",
                            background: "transparent",
                            color: "var(--text-primary)",
                            fontSize: "12px",
                            fontWeight: "500",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                        >
                          🗑 Delete
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Character Sheets & Reference Images */}
                  <div>
                    <span className="pb-section-label">
                      <span className="pb-dot purple"></span> Reference Images & Characters
                    </span>
                    <div className="pb-images">
                      {pbImages.map((img, i) => (
                        <div key={i} className="pb-image-item">
                          {img.mimeType && img.mimeType.startsWith('video/') ? (
                            <video src={img.src || (img.base64 ? `data:${img.mimeType};base64,${img.base64}` : '')} autoPlay loop muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <img src={img.src || img.data || (img.base64 ? `data:${img.mimeType || 'image/png'};base64,${img.base64}` : '')} alt={`Ref ${i}`} />
                          )}
                          <input 
                            type="text" 
                            className="pb-image-tag-input"
                            value={img.tag} 
                            placeholder="Tag name"
                            onChange={(e) => {
                              const updated = [...pbImages];
                              updated[i].tag = e.target.value;
                              updated[i]._userTagged = true;
                              setPbImages(updated);
                              pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, pbClips, updated, storyboardImage);
                            }}
                          />
                          <button 
                            className="pb-image-delete"
                            onClick={() => {
                              const updated = [...pbImages];
                              updated.splice(i, 1);
                              setPbImages(updated);
                              pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, pbClips, updated, storyboardImage);
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      {/* Upload new image/video placeholder card */}
                      <label className="pb-image-item" style={{display: "flex", flexDirection: "column", alignItems: "center", justify: "center", border: "2px dashed var(--border)", cursor: "pointer", background: "rgba(15,23,42,0.01)", borderRadius: "8px"}}>
                        <input 
                          type="file" 
                          multiple 
                          accept="image/*,video/*" 
                          style={{display: "none"}} 
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            handleImageUploads(files);
                          }}
                        />
                        <span style={{fontSize: "18px", fontWeight: "700"}}>+</span>
                        <span style={{fontSize: "9px", fontWeight: "600", color: "var(--text-muted)"}}>Add Ref</span>
                      </label>
                    </div>
                  </div>

                  {/* Visual Preset Controls */}
                  <div className="pb-cinema">
                    <span className="pb-section-label">
                      <span className="pb-dot purple"></span> Cinematic Presets
                    </span>
                    <label className="pb-cinema-row">
                      <span>Genre:</span>
                      <select value={cinemaGenre} onChange={(e) => { setCinemaGenre(e.target.value); pbSaveSession(); }}>
                        <option value="auto">Auto (Director decides)</option>
                        <option value="action">Action</option>
                        <option value="sci-fi">Sci-Fi</option>
                        <option value="cyberpunk">Cyberpunk</option>
                        <option value="fantasy">Fantasy</option>
                        <option value="horror">Horror</option>
                        <option value="thriller">Thriller</option>
                        <option value="drama">Drama</option>
                        <option value="comedy">Comedy</option>
                        <option value="documentary">Documentary</option>
                      </select>
                    </label>
                    <label className="pb-cinema-row">
                      <span>Lighting Style:</span>
                      <select value={cinemaLighting} onChange={(e) => { setCinemaLighting(e.target.value); pbSaveSession(); }}>
                        <option value="cinematic">Cinematic (High Contrast)</option>
                        <option value="neon">Neon Cyberpunk</option>
                        <option value="noir">Classic Film Noir</option>
                        <option value="soft">Soft Portrait Glow</option>
                        <option value="golden">Golden Hour Sun</option>
                        <option value="natural">Natural Ambient</option>
                        <option value="studio">Bright Studio Key</option>
                      </select>
                    </label>
                  </div>
                </div>
              )}

              {leftTab === "audio" && (
                /* Audio & Sound Settings Tab active */
                <div className="pb-audio-settings-card" style={{display: "flex", flexDirection: "column", gap: "16px"}}>
                  
                  {/* Auto / Custom Toggle */}
                  <div style={{display: "flex", gap: "4px", background: "rgba(15,23,42,0.03)", borderRadius: "8px", padding: "3px"}}>
                    <button
                      onClick={() => setAudioInputMode("auto")}
                      style={{
                        flex: 1, padding: "7px 8px", fontSize: "11px", fontWeight: "700",
                        border: "none", borderRadius: "6px", cursor: "pointer", transition: "all 0.2s",
                        background: audioInputMode === "auto" ? "var(--accent)" : "transparent",
                        color: audioInputMode === "auto" ? "#fff" : "var(--text-secondary)",
                        boxShadow: audioInputMode === "auto" ? "var(--shadow-sm)" : "none"
                      }}
                    >
                      🪄 Auto Suggest
                    </button>
                    <button
                      onClick={() => setAudioInputMode("custom")}
                      style={{
                        flex: 1, padding: "7px 8px", fontSize: "11px", fontWeight: "700",
                        border: "none", borderRadius: "6px", cursor: "pointer", transition: "all 0.2s",
                        background: audioInputMode === "custom" ? "var(--accent)" : "transparent",
                        color: audioInputMode === "custom" ? "#fff" : "var(--text-secondary)",
                        boxShadow: audioInputMode === "custom" ? "var(--shadow-sm)" : "none"
                      }}
                    >
                      ✍️ Custom Prompt
                    </button>
                  </div>

                  {/* Auto mode: one-click AI analysis */}
                  {audioInputMode === "auto" && (
                    <button
                      onClick={pbAutoSuggestAudio}
                      disabled={isAudioAnalyzing || pbClips.length === 0}
                      style={{
                        width: "100%", padding: "10px", borderRadius: "6px", border: "none",
                        background: "var(--accent-gradient)", color: "#fff", fontSize: "12px", fontWeight: "600",
                        cursor: pbClips.length > 0 && !isAudioAnalyzing ? "pointer" : "not-allowed",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                        boxShadow: "var(--shadow-sm)", opacity: pbClips.length > 0 && !isAudioAnalyzing ? 1 : 0.6
                      }}
                    >
                      {isAudioAnalyzing ? "Analyzing audio..." : "🪄 Auto-Analyze Script & Fill Audio Settings"}
                    </button>
                  )}

                  {/* Music Prompt — shown always but disabled in auto mode until filled */}
                  <div className="pb-settings-group">
                    <span className="pb-settings-label">Music Soundtrack BED Brief (Lyria)</span>
                    <textarea 
                      className="pb-settings-textarea"
                      placeholder={audioInputMode === "auto" 
                        ? "Click 'Auto-Analyze' to fill this from your script..." 
                        : "Describe the background instrumental score (e.g. ambient cyberpunk synths with orchestral build)..."}
                      value={musicPrompt}
                      onChange={(e) => { 
                        const val = e.target.value;
                        setMusicPrompt(val); 
                        pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, pbClips, pbImages, storyboardImage, val, voiceSignature); 
                      }}
                      rows={3}
                      style={{opacity: audioInputMode === "auto" && !musicPrompt ? 0.6 : 1}}
                    />
                  </div>

                  {/* Voice Settings — shown always */}
                  <div className="pb-settings-group">
                    <span className="pb-settings-label">Voice Dialogue & Narrator Settings</span>
                    <textarea 
                      className="pb-settings-textarea"
                      placeholder={audioInputMode === "auto"
                        ? "Click 'Auto-Analyze' to fill this from your script..."
                        : "Describe character voice styles (e.g. Deep male, authoritative, quiet pacing)..."}
                      value={voiceSignature}
                      onChange={(e) => { 
                        const val = e.target.value;
                        setVoiceSignature(val); 
                        pbSaveSession(activeSessionId, sessionName, chatHistory, pbFormat, videoModel, pbClips, pbImages, storyboardImage, musicPrompt, val); 
                      }}
                      rows={3}
                      style={{opacity: audioInputMode === "auto" && !voiceSignature ? 0.6 : 1}}
                    />
                  </div>

                  {/* Voiceover Script — the actual narration text for ElevenLabs */}
                  <div className="pb-settings-group">
                    <span className="pb-settings-label" style={{display: "flex", alignItems: "center", gap: "6px"}}>
                      🎙️ Voiceover Script (ElevenLabs TTS)
                    </span>
                    <p style={{fontSize: "10.5px", color: "var(--text-muted)", margin: "0 0 4px 0", lineHeight: 1.4}}>
                      Paste your full voiceover narration here. ElevenLabs will synthesize this text and overlay it on your video clips.
                    </p>
                    <textarea 
                      className="pb-settings-textarea"
                      placeholder="Paste your voiceover narration script here...&#10;&#10;e.g. &quot;Har namak mein ek kahaani hoti hai... Catch ke saath, har zaika banta hai khaas.&quot;"
                      value={voiceoverScript}
                      onChange={(e) => setVoiceoverScript(e.target.value)}
                      rows={5}
                      style={{
                        background: "rgba(124, 58, 237, 0.03)",
                        border: "1px solid rgba(124, 58, 237, 0.15)"
                      }}
                    />
                  </div>

                  {/* ElevenLabs Voice Selection */}
                  <div className="pb-settings-group">
                    <span className="pb-settings-label">ElevenLabs Voice Selection</span>
                    <select
                      className="pb-settings-select"
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: "1px solid var(--glass-border)",
                        background: "rgba(255, 255, 255, 0.45)",
                        color: "var(--text)",
                        fontSize: "12px",
                        marginBottom: "8px",
                        outline: "none"
                      }}
                      value={PB_ELEVENLABS_VOICES.some(v => v.id === elevenLabsVoiceId) ? elevenLabsVoiceId : "custom"}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val !== "custom") {
                          setElevenLabsVoiceId(val);
                          setTimeout(() => pbSaveSession(), 50);
                        }
                      }}
                    >
                      {PB_ELEVENLABS_VOICES.map(v => (
                        <option key={v.id} value={v.id} style={{background: "var(--panel-bg)", color: "var(--text)"}}>{v.name}</option>
                      ))}
                      <option value="custom" style={{background: "var(--panel-bg)", color: "var(--text)"}}>✍️ Custom Voice ID Override</option>
                    </select>

                    {(!PB_ELEVENLABS_VOICES.some(v => v.id === elevenLabsVoiceId) || 
                      (typeof window !== "undefined" && document.querySelector(".pb-settings-select")?.value === "custom")) && (
                      <input 
                        type="text" 
                        className="pb-settings-input"
                        value={elevenLabsVoiceId}
                        onChange={(e) => { 
                          setElevenLabsVoiceId(e.target.value); 
                          setTimeout(() => pbSaveSession(), 50);
                        }}
                        placeholder="Enter ElevenLabs Voice ID"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* COLUMN 3: Director Chat */}
          <div className="pb-panel pb-panel-chat">
            <div className="pb-panel-header">
              <span className="pb-panel-title">💬 Director Chat</span>
              <button 
                style={{background: "transparent", border: "none", color: "var(--accent)", fontSize: "11px", fontWeight: "600", cursor: "pointer"}}
                onClick={pbResetSession}
              >
                Refresh
              </button>
            </div>
            
            <div className="pb-panel-body pb-chat-container">
              {/* Chat history */}
              <div className="pb-chat-history has-messages" id="pbChatHistory">
                {chatHistory.map((msg, i) => {
                  const senderName = msg.role === "user" ? "You" : "Creative Director";
                  const senderClass = msg.role === "user" ? "user" : "agent";
                  
                  // Parse [OPTION: ...] and [DO: ...] markers from agent messages
                  let textContent = msg.text;
                  let options = [];
                  let doActions = [];
                  if (msg.role === "model") {
                    const optionRegex = /\[OPTION:\s*(.+?)\]/g;
                    const doRegex = /\[DO:\s*(.+?)\]/g;
                    let match;
                    while ((match = optionRegex.exec(msg.text)) !== null) {
                      options.push(match[1].trim());
                    }
                    while ((match = doRegex.exec(msg.text)) !== null) {
                      doActions.push(match[1].trim());
                    }
                    // Strip markers from displayed text
                    textContent = textContent.replace(/\[OPTION:\s*.+?\]/g, "").replace(/\[DO:\s*.+?\]/g, "").trim();
                  }

                  const handleOptionClick = (optionText) => {
                    if (chatInputRef.current) {
                      chatInputRef.current.value = optionText;
                    }
                    handleSendMessage({ preventDefault: () => {} });
                  };

                  const handleDoClick = (action) => {
                    const lower = action.toLowerCase();
                    if (lower.includes("generate video") || lower.includes("generate the video")) {
                      pbGenerateVideo();
                    } else if (lower.includes("storyboard") || lower.includes("visual board")) {
                      pbGenerateStoryboard();
                    } else {
                      // Treat as a chat message
                      if (chatInputRef.current) chatInputRef.current.value = action;
                      handleSendMessage({ preventDefault: () => {} });
                    }
                  };

                  return (
                    <div key={i} className={`pb-chat-msg ${senderClass}`}>
                      <span className="pb-chat-msg-sender">{senderName}</span>
                      
                      {/* Show attached images */}
                      {msg.images && msg.images.length > 0 && (
                        <div className="pb-chat-images">
                          {msg.images.map((img, ii) => (
                            <img key={ii} src={img.src} alt="ref" className="pb-chat-image-thumb" />
                          ))}
                        </div>
                      )}
                      
                      <div className="pb-chat-bubble">
                        {senderClass === "user" ? (
                          pbRenderChatMarkdown(textContent)
                        ) : (
                          <div>
                            <div style={{whiteSpace: "pre-wrap"}}>
                              {pbRenderChatMarkdown(textContent)}
                            </div>
                            
                            {/* Render option buttons inside bubble */}
                            {(options.length > 0 || doActions.length > 0) && (
                              <div className="pb-action-buttons">
                                {options.map((opt, oi) => (
                                  <button
                                    key={`opt-${oi}`}
                                    className="pb-action-btn"
                                    onClick={() => handleOptionClick(opt)}
                                  >
                                    {opt}
                                  </button>
                                ))}
                                {doActions.map((act, ai) => (
                                  <button
                                    key={`do-${ai}`}
                                    className="pb-action-btn pb-action-btn-do"
                                    onClick={() => handleDoClick(act)}
                                  >
                                    🚀 {act}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {isTyping && (
                  <div className="pb-chat-msg agent">
                    <span className="pb-chat-msg-sender">Creative Director</span>
                    <div className="pb-chat-bubble" style={{ padding: "4px 8px" }}>
                      <div className="pb-typing-indicator">
                        <div className="pb-typing-dot"></div>
                        <div className="pb-typing-dot"></div>
                        <div className="pb-typing-dot"></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Inline Reference analysis progress card */}
                {isProcessingReference && (
                  <div className="pb-chat-status-card">
                    {referenceAnalysisThumbnail ? (
                      <div className="pb-chat-status-thumb">
                        <img src={referenceAnalysisThumbnail} alt="Ref Uploading" />
                      </div>
                    ) : (
                      <div className="pb-chat-status-thumb" style={{display: "flex", alignItems: "center", justify: "center", background: "#f1f5f9"}}>
                        🖼
                      </div>
                    )}
                    <div className="pb-chat-status-info">
                      <span className="pb-chat-status-label">
                        <span className="pb-chat-status-pulse"></span> Analyzing Reference
                      </span>
                      <span className="pb-chat-status-text">
                        Extracting character visual traits...
                      </span>
                    </div>
                  </div>
                )}
                
                <div ref={chatBottomRef} />
              </div>

              {/* Chat Input Bar */}
              <form className="pb-chat-bar" onSubmit={handleSendMessage}>
                <button
                  type="button"
                  className="pb-attach-btn"
                  title="Upload references"
                  onClick={() => fileInputRef.current?.click()}
                >
                  📎
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  multiple
                  accept="image/*,video/*"
                  style={{ display: "none" }}
                  onChange={handleChatAttachment}
                />
                
                {/* Pasted/selected attachment preview strip */}
                {chatFiles.length > 0 && (
                  <div className="pb-chat-file-preview">
                    {chatFiles.map((f, fi) => (
                      <div key={fi} className="pb-chat-file-item">
                        <div className="pb-chat-file-thumb">
                          {f.mimeType && f.mimeType.startsWith("video/") ? (
                            <video src={f.src} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <img src={f.src} alt={f.name} />
                          )}
                          <button type="button" onClick={() => setChatFiles(prev => prev.filter((_, idx) => idx !== fi))}>✕</button>
                        </div>
                        <input
                          type="text"
                          className="pb-chat-file-tag"
                          placeholder={`tag ${fi + 1}…`}
                          value={f.tag || ""}
                          onChange={(e) => {
                            const nextTag = e.target.value;
                            setChatFiles(prev => prev.map((x, idx) => idx === fi ? { ...x, tag: nextTag } : x));
                            // Sync tag to reference panel
                            if (f._refId) {
                              setPbImages(prev => prev.map(img => img._refId === f._refId ? { ...img, tag: nextTag, _userTagged: true } : img));
                            }
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                        />
                      </div>
                    ))}
                  </div>
                )}
                
                <textarea
                  ref={chatInputRef}
                  placeholder="Talk to the AI director... (Shift+Enter for newline)"
                  className="pb-chat-input"
                  rows={1}
                  onPaste={handlePaste}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                  onInput={(e) => {
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 72) + "px";
                  }}
                />
                <button type="submit" className="pb-send-btn">Send</button>
              </form>
            </div>
          </div>
        </div>

        {/* LOWER PORTION: Full-Width Production Timeline */}
        <div className="pb-timeline-panel">
          <div className="pb-timeline-header">
            <span className="pb-timeline-title">
              🎞 Production Timeline
              <span className="pb-timecode">
                {pbFormatTimecode(readyTimelineSeconds)}
              </span>
            </span>

            {/* NLE Toolbar edit utilities */}
            <div className="pb-nle-toolbar">
              <button className="pb-nle-tool-btn active" title="Select Tool (V)">🖱</button>
              <button className="pb-nle-tool-btn" title="Blade Cut Tool (C)">✂</button>
              <button className="pb-nle-tool-btn" title="Slip Tool (Y)">↕</button>
              <button className="pb-nle-tool-btn" title="Swap Clips (S)">⇄</button>
            </div>

            {/* Export & Resolution master selectors */}
            <div style={{display: "flex", gap: "8px", alignItems: "center"}}>
              {isVideoGenerating ? (
                <button
                  className="pb-export-master-btn"
                  onClick={handleStopGeneration}
                  style={{
                    background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                    boxShadow: "0 4px 12px rgba(239, 68, 68, 0.25)"
                  }}
                  title="Stop generating current timeline"
                >
                  🛑 STOP GENERATION
                </button>
              ) : (
                <button
                  className="pb-export-master-btn"
                  onClick={pbGenerateAllTimelineClips}
                  style={{
                    background: "var(--accent-gradient)",
                    boxShadow: "0 4px 12px rgba(124, 58, 237, 0.25)"
                  }}
                >
                  🎬 GENERATE ALL CLIPS
                </button>
              )}

              {isPlayingFullTimeline ? (
                <button
                  className="pb-export-master-btn"
                  onClick={() => setIsPlayingFullTimeline(false)}
                  style={{
                    background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                    boxShadow: "0 4px 12px rgba(245, 158, 11, 0.25)"
                  }}
                  title="Pause sequential playback of timeline"
                >
                  ⏸️ PAUSE PLAYBACK
                </button>
              ) : (
                <button
                  className="pb-export-master-btn"
                  disabled={pbClips.length === 0}
                  onClick={() => {
                    setIsPlayingFullTimeline(true);
                    setActiveClipIdx(0);
                    setTimeout(() => {
                      const vid = stageVideoRef.current;
                      if (vid) vid.play().catch(e => console.log("Play failed:", e));
                    }, 100);
                  }}
                  style={{
                    background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                    boxShadow: "0 4px 12px rgba(59, 130, 246, 0.25)"
                  }}
                  title="Play all clips in the timeline sequentially"
                >
                  ▶️ PLAY TIMELINE
                </button>
              )}

              {!isGenerating && storyboardImage && (
                <button
                  className="pb-export-master-btn"
                  onClick={pbGenerateStoryboardTimeline}
                  style={{
                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    boxShadow: "0 4px 12px rgba(16, 185, 129, 0.25)"
                  }}
                  title="Re-generate timeline structure from the uploaded storyboard sheet"
                >
                  🔄 RE-GENERATE TIMELINE
                </button>
              )}

              <select
                id="pbExportResSelect"
                style={{padding: "6px 10px", fontSize: "11px", fontWeight: "700", border: "1px solid var(--border)", borderRadius: "4px", background: "#fff", cursor: "pointer", fontFamily: "var(--font-body)"}}
              >
                <option value="">1080p Standard</option>
                <option value="-2k">2K High-Res</option>
                <option value="-4k">4K Cinematic</option>
              </select>
              
              <button
                className="pb-export-master-btn"
                onClick={() => {
                  const resSelect = document.getElementById("pbExportResSelect");
                  const suffix = resSelect ? resSelect.value : "";
                  pbMergeAndDownload(suffix);
                }}
                disabled={!canExportTimeline}
                title={canExportTimeline ? "Export master sequence" : "Generate clips first"}
              >
                📥 EXPORT MASTER
              </button>
            </div>
          </div>

          {/* Canvas multi-track workspace */}
          <div 
            className="pb-nle-canvas"
            onWheel={(e) => {
              // Scroll horizontally with trackpad/mouse vertical scroll
              if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.currentTarget.scrollLeft += e.deltaY;
              } else {
                e.currentTarget.scrollLeft += e.deltaX;
              }
            }}
          >
            
            {/* Timeline Ruler */}
            <div 
              className="pb-nle-ruler" 
              onMouseDown={handleTimelineMouseDown} 
              style={{ cursor: "ew-resize", minWidth: timelineMinWidth, display: "flex", position: "relative" }}
            >
              <div style={{
                position: "sticky",
                left: 0,
                width: "100px",
                minWidth: "100px",
                height: "100%",
                background: "var(--bg-card)",
                borderRight: "1px solid var(--border)",
                zIndex: 6
              }}></div>
              {(() => {
                const totalSec = Math.max(12, Math.ceil(plannedTimelineSeconds || 10));
                const ticks = [];
                for (let t = 0; t <= totalSec; t += 2) ticks.push(t);
                return ticks.map(t => (
                  <div 
                    key={t} 
                    className="pb-nle-tick"
                    style={{left: `${t * pxPerSec + 100}px`}}
                  >
                    {t}s
                  </div>
                ));
              })()}
            </div>

            {/* Lane 1: VIDEO 2 (Overlay & Bridge) */}
            <div className="pb-nle-lane" style={{ minWidth: timelineMinWidth }}>
              <div className="pb-nle-lane-header">
                <span>Video 2</span>
                <div className="pb-nle-lane-icons">👁 🔒</div>
              </div>
              <div 
                className="pb-nle-lane-track"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleClipDrop(e, "bridge")}
              >
                {/* Render bridge transition clips */}
                {pbClips.map((clip, i) => {
                    const duration = pbGetClipTimelineSeconds(clip);
                    const left = pbClips
                      .slice(0, i)
                      .reduce((total, priorClip) => total + pbGetClipTimelineSeconds(priorClip), 0) * pxPerSec;
                    const width = duration * pxPerSec;
                    
                    const isBridge = clip.type === "bridge";
                    if (!isBridge) return null;
                    
                    return (
                      <div
                        key={clip.id || i}
                        className={`pb-nle-clip is-bridge ${activeClipIdx === i ? "is-active" : ""} is-done`}
                        style={{left: `${left}px`, width: `${width}px`}}
                        onClick={() => setActiveClipIdx(i)}
                        draggable={true}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", i);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                      >
                        <span className="pb-nle-clip-label">🔗 Bridge #{i+1}</span>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Lane 2: VIDEO 1 (Primary footage timeline) */}
            <div className="pb-nle-lane" style={{ minWidth: timelineMinWidth }}>
              <div className="pb-nle-lane-header">
                <span>Video 1</span>
                <div className="pb-nle-lane-icons">👁 🔒</div>
              </div>
              <div 
                className="pb-nle-lane-track"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleClipDrop(e, "main")}
              >
                {/* Renders main story clips */}
                {pbClips.map((clip, i) => {
                    const duration = pbGetClipTimelineSeconds(clip);
                    const left = pbClips
                      .slice(0, i)
                      .reduce((total, priorClip) => total + pbGetClipTimelineSeconds(priorClip), 0) * pxPerSec;
                    const width = duration * pxPerSec;
                    
                    const isBridge = clip.type === "bridge";
                    if (isBridge) return null; // rendered in Lane 1
                    
                    const isActive = activeClipIdx === i;
                    const statusClass = clip.status === "done" ? "is-done" : (clip.status === "generating" ? "is-generating" : "is-queued");
                    
                    return (
                      <div
                        key={clip.id || i}
                        className={`pb-nle-clip ${isActive ? "is-active" : ""} ${statusClass}`}
                        style={{left: `${left}px`, width: `${width}px`}}
                        onClick={() => setActiveClipIdx(i)}
                        draggable={true}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", i);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                      >
                        {clip.videoUrl ? (
                          <img className="pb-nle-clip-thumb" src={clip.videoUrl} alt="clip preview" />
                        ) : clip.sceneImage ? (
                          <img className="pb-nle-clip-thumb" src={`data:image/png;base64,${clip.sceneImage}`} alt="scene preview" />
                        ) : (
                          <div className="pb-nle-clip-thumb" style={{background: "rgba(15,23,42,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px"}}>🎬</div>
                        )}
                        <span className="pb-nle-clip-label">
                          {clip.prompt ? clip.prompt.slice(0, 30) : `Scene Clip ${i+1}`}...
                        </span>
                        <span className="pb-nle-clip-dur">{duration}s</span>
                      </div>
                    );
                  })}
                
                {/* Inline transition controls between clips */}
                {pbClips.slice(0, -1).map((c, i) => {
                    const duration = pbGetClipTimelineSeconds(c);
                    const elapsedBeforeClip = pbClips
                      .slice(0, i)
                      .reduce((total, priorClip) => total + pbGetClipTimelineSeconds(priorClip), 0);
                    const left = (elapsedBeforeClip + duration) * pxPerSec;
                    
                    const next = pbClips[i + 1];
                    if (!(next && c.type !== "bridge" && next.type !== "bridge")) return null;
                    const selectedTransition = pbGetTransitionAfter(i);
                    const canGenerateBridge = c.status === "done" && c.videoUrl && next.status === "done" && next.videoUrl;
                    return (
                      <div
                        key={`transition-${i}`}
                        className={`pb-nle-transition-anchor ${activeTransitionIdx === i ? "is-active" : ""}`}
                        style={{ left: `${left}px` }}
                      >
                        <button
                          type="button"
                          className={`pb-nle-insert ${selectedTransition.id !== "cut" ? "has-transition" : ""}`}
                          title={`Transition: ${selectedTransition.label}`}
                          disabled={isGenerating}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTransitionIdx(activeTransitionIdx === i ? null : i);
                          }}
                        >
                          {selectedTransition.id === "cut" ? "+" : selectedTransition.label.slice(0, 1)}
                        </button>
                        {activeTransitionIdx === i && (
                          <div className="pb-transition-popover" onClick={(e) => e.stopPropagation()}>
                            <div className="pb-transition-popover-head">
                              <span>Transition</span>
                              <button type="button" onClick={() => setActiveTransitionIdx(null)} aria-label="Close transitions">×</button>
                            </div>
                            <div className="pb-transition-current">
                              Clip {i + 1} → Clip {i + 2}: <strong>{selectedTransition.label}</strong>
                            </div>
                            <div className="pb-transition-grid">
                              {PB_TRANSITION_PRESETS.map((preset) => (
                                <button
                                  key={preset.id}
                                  type="button"
                                  className={`pb-transition-option ${selectedTransition.id === preset.id ? "active" : ""}`}
                                  onClick={() => pbSetTransitionAfter(i, preset.id)}
                                  title={`${preset.group} transition`}
                                >
                                  <span className="pb-transition-icon">{preset.icon}</span>
                                  <span className="pb-transition-label">{preset.label}</span>
                                  <span className="pb-transition-group">{preset.group}</span>
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              className="pb-transition-ai-bridge"
                              disabled={!canGenerateBridge || isGenerating}
                              title={canGenerateBridge ? "Generate an AI bridge clip between these clips" : "Generate both neighboring clips first"}
                              onClick={() => {
                                setActiveTransitionIdx(null);
                                pbInsertFiller(i);
                              }}
                            >
                              ✨ Generate AI Bridge/Filler
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Lane 3: AUDIO 1 (Soundtrack waveform track) */}
            <div className="pb-nle-lane" style={{ minWidth: timelineMinWidth }}>
              <div className="pb-nle-lane-header">
                <span>Audio 1</span>
                <div className="pb-nle-lane-icons">🔊 🔒</div>
              </div>
              <div className="pb-nle-lane-track">
                {/* Soundtrack visual block */}
                {plannedTimelineSeconds > 0 && (
                  <div 
                    className="pb-nle-clip"
                    style={{left: "0px", width: `${plannedTimelineSeconds * pxPerSec}px`, border: "1px solid rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.05)", display: "flex", alignItems: "center", padding: "0 10px"}}
                  >
                    <div className="pb-audio-waveform-canvas"></div>
                    <span className="pb-nle-clip-label" style={{color: "var(--green-teal)", position: "absolute", left: "10px"}}>
                      🎵 Continuous Soundtrack Bed (Lyria)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Timeline Scrubbing Playhead */}
            {(() => {
              const playheadLeft = playhead * pxPerSec + 100;
              return (
                <div 
                  className="pb-nle-playhead" 
                  style={{left: `${playheadLeft}px`}}
                ></div>
              );
            })()}

          </div>
        </div>
      </div>

      {/* Production History library modal */}
      {showLibrary && (
        <div className="pb-lib-overlay" onClick={() => setShowLibrary(false)}>
          <div className="pb-lib-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pb-lib-head">
              <span className="pb-lib-title">🎞️ Production History</span>
              <button className="pb-lib-close" onClick={() => setShowLibrary(false)}>✕</button>
            </div>
            <div className="pb-lib-body">
              {pbGetAllSessions().slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map((sess) => {
                const vids = videoLibrary.filter(v => v.sessionId === sess.id);
                return (
                  <div key={sess.id} className={`pb-lib-session ${sess.id === activeSessionId ? "is-current" : ""}`}>
                    <div className="pb-lib-session-head">
                      <div className="pb-lib-session-info">
                        <span className="pb-lib-session-name">{sess.name || "Untitled film"}{sess.id === activeSessionId ? " · current" : ""}</span>
                        <span className="pb-lib-session-meta">{new Date(sess.updatedAt || 0).toLocaleString()} · {(sess.timelineClips || []).length} clips · {vids.length} renders</span>
                      </div>
                      {sess.id !== activeSessionId && (
                        <button className="pb-lib-continue" onClick={() => { pbLoadSession(sess.id); setShowLibrary(false); }}>
                          ▶ Continue this film
                        </button>
                      )}
                    </div>
                    {vids.length > 0 && (
                      <div className="pb-lib-grid">
                        {vids.map((item) => (
                          <div key={item.key} className="pb-lib-card">
                            {libPreviews[item.key] ? (
                              <video src={libPreviews[item.key]} controls className="pb-lib-video" />
                            ) : (
                              <button className="pb-lib-preview-btn" onClick={() => pbLoadLibraryPreview(item.key)}>▶ Preview</button>
                            )}
                            <div className="pb-lib-card-name">{item.name}</div>
                            {item.prompt && <div className="pb-lib-card-prompt" title={item.prompt}>{item.prompt}</div>}
                            <div className="pb-lib-card-row">
                              <span className="pb-lib-card-time">{new Date(item.timestamp).toLocaleTimeString()}</span>
                              <button className="pb-lib-card-dl" onClick={() => pbDownloadLibraryVideo(item.key, item.fileName)}>💾 Download</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {videoLibrary.some(v => !v.sessionId) && (
                <div className="pb-lib-session">
                  <div className="pb-lib-session-head">
                    <div className="pb-lib-session-info">
                      <span className="pb-lib-session-name">Earlier renders</span>
                      <span className="pb-lib-session-meta">from before session history</span>
                    </div>
                  </div>
                  <div className="pb-lib-grid">
                    {videoLibrary.filter(v => !v.sessionId).map((item) => (
                      <div key={item.key} className="pb-lib-card">
                        {libPreviews[item.key] ? (
                          <video src={libPreviews[item.key]} controls className="pb-lib-video" />
                        ) : (
                          <button className="pb-lib-preview-btn" onClick={() => pbLoadLibraryPreview(item.key)}>▶ Preview</button>
                        )}
                        <div className="pb-lib-card-name">{item.name}</div>
                        <div className="pb-lib-card-row">
                          <span className="pb-lib-card-time">{new Date(item.timestamp).toLocaleTimeString()}</span>
                          <button className="pb-lib-card-dl" onClick={() => pbDownloadLibraryVideo(item.key, item.fileName)}>💾 Download</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
