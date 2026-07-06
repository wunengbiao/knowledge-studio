# RAG Knowledge Base Design System

## 1. Product posture
This is a local Electron knowledge-base chat product. The UI should feel compact, precise, and utility-first: light neutral surfaces, blue as the primary action color, purple only for assistant identity, and no decorative visual noise.

## 2. Visual tokens
- Surface: `white`, `gray-50`, `gray-100` for layered panels.
- Borders: `gray-200` default, `blue-400` focus.
- Primary action: `blue-500` → `blue-600` gradient for send/confirm actions.
- Assistant identity: `purple-500` → `purple-600` gradient for bot avatars.
- Danger: existing `red-50` / `red-200` / `red-700` pattern.
- Radius: `rounded-lg` for menus, `rounded-xl` for controls, `rounded-2xl` for chat/input containers.
- Shadow: use subtle `shadow-sm` for chat bubbles and `shadow-lg` for floating pickers; avoid heavy card shadows except modal surfaces.

## 3. Typography
Use the existing system font stack through Tailwind defaults. Preserve the current dense information hierarchy: `text-sm` body controls, `text-xs` metadata, `text-[10px]` only for compact counters.

## 4. Layout rules
Assistant settings belong next to chat, not as a new route. Keep controls chat-local and compact: selector in the input/header area, create/edit in a modal panel. Do not expand `SettingsPage.tsx` for assistant management unless future requirements demand global administration.

## 5. Interaction rules
- Manual `@` knowledge-base selection remains available and overrides assistant defaults for a send.
- Assistant-bound knowledge bases should be visible as ordinary selected KB chips.
- Model parameter controls must be explicit enable/value pairs so disabled parameters are omitted from API payloads.
- Hover/focus states must use existing blue/gray patterns and remain keyboard reachable.

## 6. Component guidance
Use existing Lucide icons only; no emoji icons. Keep forms single-column, with compact labels and explanatory helper text. Prefer existing Tailwind utility patterns over adding CSS files.

## 7. Accessibility and QA
All icon-only buttons need `type="button"` and an accessible label or visible context. Modal close/save actions must be reachable by keyboard. Verify at least the 1280px desktop Electron layout; the chat surface should not introduce horizontal overflow.
