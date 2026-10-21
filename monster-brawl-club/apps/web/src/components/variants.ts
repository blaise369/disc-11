import { variantMultiplier, type Variant } from '@mbc/shared';

export const VARIANT_INFO: Record<Variant, { label: string; icon: string; chip: string; frameGlow: string }> = {
  normal: { label: 'Normal', icon: '', chip: '', frameGlow: '' },
  shiny: { label: 'Shiny', icon: '✨', chip: 'bg-[#fff3a8]', frameGlow: 'shadow-[0_0_14px_4px_#fff3a8]' },
  radioactive: { label: 'Radioactive', icon: '☢️', chip: 'bg-[#7dff3a]', frameGlow: 'shadow-[0_0_16px_5px_#7dff3a]' },
  void: { label: 'Void', icon: '🕳️', chip: 'bg-[#7a2cff] text-white', frameGlow: 'shadow-[0_0_18px_6px_#7a2cff]' },
  celestial: { label: 'Celestial', icon: '🌟', chip: 'bg-gradient-to-r from-[#ffd23f] via-[#ff7ad9] to-[#3fd0ff]', frameGlow: 'shadow-[0_0_22px_8px_#ffd23f]' },
};

export const variantLabel = (v: Variant) => `${VARIANT_INFO[v].icon} ${VARIANT_INFO[v].label} ×${variantMultiplier(v)}`;
