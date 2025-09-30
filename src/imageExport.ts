import html2canvas from "html2canvas";

function resolveNoteBackgroundColor(element: HTMLElement): string {
  const ownerDocument = element.ownerDocument ?? document;
  const defaultView = ownerDocument.defaultView ?? window;

  const elementBackground =
    defaultView.getComputedStyle(element).backgroundColor;
  if (
    elementBackground &&
    elementBackground !== "transparent" &&
    elementBackground !== "rgba(0, 0, 0, 0)"
  ) {
    return elementBackground;
  }

  const rootBackground = ownerDocument.documentElement
    ? defaultView
        .getComputedStyle(ownerDocument.documentElement)
        .getPropertyValue("--background-color")
        .trim()
    : "";
  if (rootBackground) {
    return rootBackground;
  }

  const body = ownerDocument.body ?? document.body;
  return defaultView.getComputedStyle(body).backgroundColor;
}

function createImageFileName(): string {
  const baseTitle = (document.title || "note").trim().toLowerCase();
  const normalisedBase =
    baseTitle.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "note";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${normalisedBase}-${timestamp}.png`;
}

export async function exportNoteAsImage(noteElement: HTMLDivElement) {
  const backgroundColor = resolveNoteBackgroundColor(noteElement);
  const canvas = await html2canvas(noteElement, {
    backgroundColor,
    scale: window.devicePixelRatio || 1,
    useCORS: true,
  });
  const dataUrl = canvas.toDataURL("image/png");
  const downloadLink = document.createElement("a");
  downloadLink.href = dataUrl;
  downloadLink.download = createImageFileName();
  downloadLink.rel = "noopener";
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
}

