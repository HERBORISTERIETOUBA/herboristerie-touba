// Optional brand images. If the original image exists, it is loaded automatically.
// If it does not exist yet, the page remains clean and functional.
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("img[data-optional-src]").forEach((img) => {
    const src = img.getAttribute("data-optional-src");
    if (!src) return;
    img.addEventListener("error", () => {
      img.style.display = "none";
      img.setAttribute("aria-hidden", "true");
    }, { once: true });
    img.src = src;
  });
});

