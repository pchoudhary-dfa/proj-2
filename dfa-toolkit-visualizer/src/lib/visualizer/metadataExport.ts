import { downloadBlob } from "@/lib/visualizer/export/downloadUtils";

const METADATA_ELEMENT_ID = "metadata-tab-export-target";

/**
 * Captures the metadata tab DOM element, temporarily expanding scroll
 * so the full content is rendered, then restores the original scroll state.
 */
async function captureMetadataCanvas(): Promise<HTMLCanvasElement | null> {
  const el = document.getElementById(METADATA_ELEMENT_ID);
  if (!el) return null;

  const scrollContainer = el.querySelector<HTMLElement>(".overflow-auto");
  let savedOverflow = "";
  let savedMaxHeight = "";
  let savedHeight = "";

  if (scrollContainer) {
    savedOverflow = scrollContainer.style.overflow;
    savedMaxHeight = scrollContainer.style.maxHeight;
    savedHeight = scrollContainer.style.height;
    scrollContainer.style.overflow = "visible";
    scrollContainer.style.maxHeight = "none";
    scrollContainer.style.height = "auto";
  }

  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(el, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    logging: false,
  });

  if (scrollContainer) {
    scrollContainer.style.overflow = savedOverflow;
    scrollContainer.style.maxHeight = savedMaxHeight;
    scrollContainer.style.height = savedHeight;
  }

  return canvas;
}

export async function exportMetadataAsJpg(filename = "metadata.jpg"): Promise<void> {
  const canvas = await captureMetadataCanvas();
  if (!canvas) return;

  canvas.toBlob(
    (blob) => {
      if (blob) downloadBlob(blob, filename, "image/jpeg");
    },
    "image/jpeg",
    0.92,
  );
}

export async function exportMetadataAsPdf(filename = "metadata.pdf"): Promise<void> {
  const canvas = await captureMetadataCanvas();
  if (!canvas) return;

  const { jsPDF } = await import("jspdf");

  const imgWidth = canvas.width;
  const imgHeight = canvas.height;

  const pxToMm = 0.264583;
  const pdfWidth = imgWidth * pxToMm;
  const pdfHeight = imgHeight * pxToMm;

  const maxPageWidth = 297; // A4 landscape width in mm
  const scale = pdfWidth > maxPageWidth ? maxPageWidth / pdfWidth : 1;
  const finalWidth = pdfWidth * scale;
  const finalHeight = pdfHeight * scale;

  const orientation = finalWidth > finalHeight ? "landscape" : "portrait";
  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: [finalWidth + 20, finalHeight + 20],
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.92);
  pdf.addImage(imgData, "JPEG", 10, 10, finalWidth, finalHeight);
  pdf.save(filename);
}
