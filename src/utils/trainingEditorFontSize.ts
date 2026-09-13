import { Extension } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

/** Размер шрифта для выделенного фрагмента (через mark textStyle). */
export const TrainingEditorFontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] as const };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize?.replace(/['"]+/g, "") || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

export const TRAINING_FONT_SIZES_PX = [12, 14, 16, 18, 20, 24, 28, 32, 36, 48] as const;

export function parseTrainingFontSizePx(raw: string | null | undefined): number {
  if (!raw) return 16;
  const px = raw.match(/^(\d+(?:\.\d+)?)px$/i);
  if (px) return Number(px[1]);
  const rem = raw.match(/^(\d+(?:\.\d+)?)rem$/i);
  if (rem) return Math.round(Number(rem[1]) * 16);
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 16;
}
