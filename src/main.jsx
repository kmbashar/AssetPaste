import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Check,
  Clipboard,
  ExternalLink,
  FileImage,
  FolderOpen,
  Globe2,
  HelpCircle,
  Images,
  Info,
  Plus,
  Lock,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import "./styles.css";

const ACCEPTED_IMAGE_PREFIX = "image/";
const WEBFLOW_IMAGE_LIMIT_BYTES = 4 * 1024 * 1024;
const OPTIMIZED_IMAGE_TYPE = "image/webp";
const OPTIMIZED_EXTENSION = "webp";
const RASTERIZED_SVG_TYPE = "image/png";
const RASTERIZED_SVG_EXTENSION = "png";
const SVG_SNIFF_BYTES = 512 * 1024;
const SVG_EXTRACTION_CHAR_LIMIT = 512 * 1024;
const ASSET_BASE_URL = import.meta.env.BASE_URL || "./";
const AIRDOKAN_URL = "https://airdokan.com/";
const CREATOR_X_URL = "https://x.com/bashar_me1";
const CREATOR_LINKEDIN_URL = "https://www.linkedin.com/in/findbashar/";

const hasWebflowDesignerApi = () =>
  typeof window.webflow !== "undefined" &&
  typeof window.webflow.createAsset === "function";

function App() {
  const [assetItems, setAssetItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [optimizeLargeFiles, setOptimizeLargeFiles] = useState(true);
  const [toast, setToast] = useState(null);
  const [toastId, setToastId] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const previewSectionRef = useRef(null);
  const assetItemsRef = useRef([]);

  const showToast = useCallback((nextToast) => {
    setToast(nextToast);
    setToastId((current) => current + 1);
  }, []);

  const selectedItem = useMemo(
    () => assetItems.find((item) => item.id === selectedItemId) || assetItems[0] || null,
    [assetItems, selectedItemId]
  );

  const selectedMeta = useMemo(() => {
    if (!selectedItem) {
      return null;
    }

    const safeBaseName = sanitizeFilename(selectedItem.fileBaseName);

    return {
      displayName: `${safeBaseName || "asset"}${selectedItem.uploadExtension || selectedItem.extension}`,
      typeLabel: labelFromMimeType(selectedItem.file.type),
      sizeLabel: formatBytes(selectedItem.file.size),
      isOverLimit: selectedItem.file.size > WEBFLOW_IMAGE_LIMIT_BYTES,
      canOptimize: canOptimizeImage(selectedItem.file),
    };
  }, [selectedItem]);

  const clearAllItems = useCallback(() => {
    assetItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setAssetItems([]);
    setSelectedItemId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [assetItems]);

  const addFiles = useCallback(
    (files, title = "Image ready") => {
      const nextItems = [];

      files.forEach((file) => {
        if (!isImageFile(file)) {
          showToast({
            type: "error",
            title: "Unsupported file",
            message: "Please use an image file.",
          });
          return;
        }

        const nextPreviewUrl = URL.createObjectURL(file);
        const displayName = getDisplayFilename(file);
        const parts = splitFilename(displayName, file.type);
        const uploadExtension = isSvgFile(file) ? `.${RASTERIZED_SVG_EXTENSION}` : parts.extension;

        nextItems.push({
          id: createAssetItemId(),
          file,
          previewUrl: nextPreviewUrl,
          dimensions: "Checking...",
          fileBaseName: parts.basename,
          extension: parts.extension,
          uploadExtension,
          altText: createShortAltText(parts.basename, file),
          isAltTextAutomatic: true,
          status: "ready",
          error: "",
        });
      });

      if (!nextItems.length) {
        return;
      }

      setAssetItems((currentItems) => [...currentItems, ...nextItems]);
      setSelectedItemId(nextItems[0].id);
      showToast({
        type: "success",
        title,
        message:
          nextItems.length === 1
            ? `${getDisplayFilename(nextItems[0].file)} is ready to review.`
            : `${nextItems.length} images are ready to review.`,
      });
    },
    [showToast]
  );

  const removeItem = useCallback((itemId) => {
    setAssetItems((currentItems) => {
      const itemToRemove = currentItems.find((item) => item.id === itemId);
      if (itemToRemove) {
        URL.revokeObjectURL(itemToRemove.previewUrl);
      }

      const nextItems = currentItems.filter((item) => item.id !== itemId);
      setSelectedItemId((currentSelectedId) => {
        if (currentSelectedId !== itemId) {
          return currentSelectedId;
        }

        return nextItems[0]?.id || null;
      });
      return nextItems;
    });
  }, []);

  const updateSelectedItem = useCallback((updater) => {
    setAssetItems((currentItems) =>
      currentItems.map((item) => (item.id === selectedItem?.id ? updater(item) : item))
    );
  }, [selectedItem?.id]);

  const handlePaste = useCallback(
    async (event) => {
      try {
        const files = await resolveImagesFromDataTransfer(event.clipboardData);
        if (!files.length) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        addFiles(files, files.length > 1 ? "Pasted images loaded" : "Pasted image loaded");
      } catch (error) {
        showToast({
          type: "error",
          title: "Could not load pasted image",
          message: getErrorMessage(error),
        });
      }
    },
    [addFiles, showToast]
  );

  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [handlePaste]);

  useEffect(() => {
    assetItemsRef.current = assetItems;
  }, [assetItems]);

  useEffect(() => {
    return () => {
      assetItemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    window.requestAnimationFrame(() => {
      previewSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      });
    });
  }, [selectedItem]);

  async function readClipboard() {
    if (!navigator.clipboard?.read) {
      showToast({
        type: "error",
        title: "Clipboard button unavailable",
        message: "Use Cmd+V or Ctrl+V instead.",
      });
      return;
    }

    try {
      const files = await resolveImagesFromClipboardItems(await navigator.clipboard.read());
      if (files.length) {
        addFiles(files, files.length > 1 ? "Clipboard images loaded" : "Clipboard image loaded");
        return;
      }

      showToast({
        type: "error",
        title: "No image found",
        message: "The clipboard did not contain an image file.",
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Clipboard permission blocked",
        message: getErrorMessage(error),
      });
    }
  }

  async function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);

    try {
      const files = await resolveImagesFromDataTransfer(event.dataTransfer);
      if (!files.length) {
        showToast({
          type: "error",
          title: "Unsupported drop",
          message: "Drop image files, SVGs, or copied image data.",
        });
        return;
      }

      addFiles(files, files.length > 1 ? "Dropped images loaded" : "Dropped image loaded");
    } catch (error) {
      showToast({
        type: "error",
        title: "Could not load dropped image",
        message: getErrorMessage(error),
      });
    }
  }

  async function handleUpload(event) {
    event.preventDefault();

    if (!assetItems.length) {
      showToast({
        type: "error",
        title: "Nothing to upload",
        message: "Paste or choose an image first.",
      });
      return;
    }

    setIsUploading(true);
    showToast({
      type: "info",
      title: "Uploading...",
      message: assetItems.length === 1 ? "Please don't close this panel." : `Uploading ${assetItems.length} images.`,
    });

    try {
      if (!hasWebflowDesignerApi()) {
        throw new Error("Webflow Designer API is unavailable. Open AssetPaste inside Webflow Designer to upload assets.");
      }

      let uploadedCount = 0;

      for (const item of assetItems) {
        const requestedName = `${sanitizeFilename(item.fileBaseName)}${item.uploadExtension || item.extension}`;
        const renamedFile = createRenamedFile(item.file, requestedName);
        if (!renamedFile) {
          throw new Error(`Add a file name for ${getDisplayFilename(item.file)} before uploading.`);
        }

        setAssetItems((currentItems) =>
          currentItems.map((currentItem) =>
            currentItem.id === item.id ? { ...currentItem, status: "uploading", error: "" } : currentItem
          )
        );

        const uploadFile = await prepareFileForWebflowUpload(renamedFile, optimizeLargeFiles, showToast);
        const asset = await window.webflow.createAsset(uploadFile);
        if (item.altText.trim() && asset && typeof asset.setAltText === "function") {
          await asset.setAltText(item.altText.trim());
        }

        uploadedCount += 1;
        setAssetItems((currentItems) =>
          currentItems.map((currentItem) =>
            currentItem.id === item.id ? { ...currentItem, status: "uploaded", error: "" } : currentItem
          )
        );
      }

      showToast({
        type: "success",
        title: "Uploaded successfully!",
        message:
          uploadedCount === 1
            ? "1 image is now in Webflow Assets."
            : `${uploadedCount} images are now in Webflow Assets.`,
      });
      clearAllItems();
    } catch (error) {
      showToast({
        type: "error",
        title: "Upload failed",
        message: getErrorMessage(error),
      });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#f8fafc] text-[#070b18]">
      <section className="min-h-dvh overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(16,24,40,0.10)]">
        <header className="flex min-h-[82px] items-center justify-between gap-4 border-b border-slate-200 px-5">
          <div className="inline-flex min-w-0 items-center gap-2">
            <img className="h-10 w-10 rounded-lg" src={`${ASSET_BASE_URL}assets/assetpaste-icon.png`} alt="" />
            <div className="min-w-0">
              <h1 className="text-xl font-black leading-none text-[#070b18]">AssetPaste</h1>
              <p className="mt-1 text-sm font-medium leading-snug text-[#5d6886]">
                Paste images directly into Webflow Assets.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <IconOnlyButton
              className="h-10 w-10 rounded-lg border border-slate-300 text-slate-500 hover:border-slate-400 hover:bg-slate-50"
              type="button"
              aria-label="How it works"
              tooltip="How it works"
              tooltipPosition="left"
              onClick={() =>
                showToast({
                  type: "info",
                  title: "How it works",
                  message: "Copy one or multiple images, paste them here, review the queue, then upload to Webflow Assets.",
                })
              }
            >
              <HelpCircle className="h-5 w-5" strokeWidth={2} />
            </IconOnlyButton>
          </div>
        </header>

        <div className="grid min-h-[calc(100dvh-82px-66px)] lg:grid-cols-[0.78fr_1fr]">
          <section className="border-r border-slate-200 px-5 py-4">
            {assetItems.length ? (
              <div className="mb-3 flex justify-end">
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-extrabold text-slate-700">
                  {assetItems.length} queued
                </span>
              </div>
            ) : null}

            <PasteZone
              isDragging={isDragging}
              onChooseFile={() => fileInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onReadClipboard={readClipboard}
            />

            {assetItems.length ? (
              <AssetQueue
                items={assetItems}
                selectedItemId={selectedItem?.id}
                onSelect={setSelectedItemId}
                onRemove={removeItem}
              />
            ) : null}

            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept="image/*,.svg,.avif,.gif,.jpg,.jpeg,.png,.webp"
              multiple
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                if (files.length) {
                  addFiles(files, files.length > 1 ? "Image files loaded" : "Image file loaded");
                }
              }}
            />
          </section>

          <section ref={previewSectionRef} className="px-5 py-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black">Review and upload</h2>
                <p className="mt-1 text-sm font-medium text-[#5d6886]">
                  {assetItems.length > 1 ? `Editing 1 of ${assetItems.length} images.` : "Selected image details."}
                </p>
              </div>
              {selectedItem ? (
                <IconOnlyButton
                  className="h-11 w-11 rounded-lg border border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                  type="button"
                  aria-label="Clear selected image"
                  tooltip="Clear image"
                  tooltipPosition="left"
                  onClick={() => {
                    removeItem(selectedItem.id);
                    setToast(null);
                  }}
                >
                  <Trash2 className="h-6 w-6" strokeWidth={2.1} />
                </IconOnlyButton>
              ) : null}
            </div>

            {selectedItem && selectedMeta ? (
              <form className="grid gap-4" onSubmit={handleUpload}>
                <AddMorePrompt
                  count={assetItems.length}
                  onChooseFile={() => fileInputRef.current?.click()}
                  onReadClipboard={readClipboard}
                />

                <div className="grid items-center gap-4 md:grid-cols-[minmax(180px,300px)_1fr]">
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    <img
                      className="aspect-[4/3] h-full w-full object-cover"
                      src={selectedItem.previewUrl}
                      alt="Selected asset preview"
                      onLoad={(event) => {
                        const nextDimensions = `${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`;
                        updateSelectedItem((item) => ({ ...item, dimensions: nextDimensions }));
                      }}
                      onError={() =>
                        updateSelectedItem((item) => ({
                          ...item,
                          dimensions: selectedItem.file.type === "image/svg+xml" ? "SVG" : "Unknown",
                        }))
                      }
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="break-all text-xl font-black">{selectedMeta.displayName}</strong>
                      <span className="rounded-md bg-green-100 px-2.5 py-1 text-sm font-extrabold text-green-700">
                        {selectedMeta.sizeLabel}
                      </span>
                    </div>
                    <p className="mt-3 text-base font-medium text-[#5d6886]">
                      {selectedMeta.typeLabel} <span className="mx-2">•</span> {selectedItem.dimensions}
                    </p>
                  </div>
                </div>

                <div className="h-px bg-slate-200" />

                <label className="grid gap-2">
                  <span className="text-base font-extrabold">
                    File name <span className="text-red-500">*</span>
                  </span>
                  <span className="text-sm font-medium text-[#5d6886]">
                    This name will appear in Webflow Assets.
                  </span>
                  <div className="grid min-h-[50px] grid-cols-[1fr_auto] overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-[#075df6] focus-within:ring-4 focus-within:ring-blue-100">
                    <input
                      className="min-w-0 px-4 text-base outline-none"
                      value={selectedItem.fileBaseName}
                      onChange={(event) => {
                        const nextName = sanitizeDisplayFilename(event.target.value);
                        updateSelectedItem((item) => ({
                          ...item,
                          fileBaseName: nextName,
                          altText: item.isAltTextAutomatic ? createShortAltText(nextName, item.file) : item.altText,
                        }));
                      }}
                      required
                    />
                    <span className="grid min-w-[72px] place-items-center border-l border-slate-200 bg-slate-50 px-3 text-base font-medium text-slate-800">
                      {selectedItem.uploadExtension || selectedItem.extension}
                    </span>
                  </div>
                </label>

                <label className="grid gap-2">
                  <span className="text-base font-extrabold">
                    Alt text <span className="font-medium text-[#5d6886]">(optional)</span>
                  </span>
                  <span className="text-sm font-medium text-[#5d6886]">
                    Describe the image for accessibility.
                  </span>
                  <input
                    className="min-h-[50px] rounded-lg border border-slate-300 bg-white px-4 text-base outline-none focus:border-[#075df6] focus:ring-4 focus:ring-blue-100"
                    value={selectedItem.altText}
                    placeholder="Sunset over mountains and lake"
                    onChange={(event) => {
                      updateSelectedItem((item) => ({
                        ...item,
                        altText: event.target.value,
                        isAltTextAutomatic: false,
                      }));
                    }}
                  />
                </label>

                <label className="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
                  <input
                    className="mt-1 h-5 w-5 accent-[#075df6]"
                    type="checkbox"
                    checked={optimizeLargeFiles}
                    onChange={(event) => setOptimizeLargeFiles(event.target.checked)}
                  />
                  <span className="grid gap-1">
                    <strong className="text-base font-extrabold">Optimize large images over 4 MB</strong>
                    <small className="text-sm font-medium text-[#5d6886]">
                      Resize images to fit Webflow upload limits while keeping quality.
                    </small>
                  </span>
                  <Info className="mt-1 h-5 w-5 text-[#5d6886]" strokeWidth={2} />
                </label>

                <button
                  className="mt-1 inline-flex min-h-[58px] w-full items-center justify-center gap-3 rounded-lg bg-[#075df6] px-5 text-xl font-black text-white shadow-[0_12px_28px_rgba(7,93,246,0.24)] transition hover:bg-[#074bd5] disabled:cursor-not-allowed disabled:opacity-60"
                  type="submit"
                  disabled={isUploading}
                >
                  <Upload className="h-6 w-6" strokeWidth={2.1} />
                  {isUploading
                    ? "Uploading..."
                    : assetItems.length > 1
                      ? `Upload ${assetItems.length} images`
                      : "Upload to Webflow"}
                </button>

                <p className="flex items-center justify-center gap-2 text-sm font-medium text-[#5d6886]">
                  <Lock className="h-4 w-4" strokeWidth={2.2} />
                  Your image will be added to Webflow Assets.
                </p>
              </form>
            ) : (
              <EmptyPreview />
            )}
          </section>
        </div>

        <footer className="flex min-h-[66px] flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5">
          <a
            className="inline-flex items-center gap-2 text-sm font-bold text-[#5d6886]"
            href={AIRDOKAN_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>Made by</span>
            <strong className="text-[#075df6]">AirDokan</strong>
            <ExternalLink className="h-4 w-4 text-[#075df6]" strokeWidth={2.2} />
          </a>
          <nav className="flex items-center gap-2" aria-label="Creator links">
            <SocialLink href={AIRDOKAN_URL} label="AirDokan website">
              <Globe2 className="h-4 w-4" strokeWidth={2.2} />
            </SocialLink>
            <SocialLink href={CREATOR_X_URL} label="AirDokan on X">
              <span className="text-sm font-black">X</span>
            </SocialLink>
            <SocialLink href={CREATOR_LINKEDIN_URL} label="AirDokan on LinkedIn">
              <span className="text-sm font-black">in</span>
            </SocialLink>
          </nav>
        </footer>
      </section>
      {toast ? <Toast key={toastId} toast={toast} onClose={() => setToast(null)} /> : null}
    </main>
  );
}

function AddMorePrompt({ count, onChooseFile, onReadClipboard }) {
  return (
    <div className="grid gap-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <strong className="block text-sm font-black text-[#074bd5]">
          {count === 1 ? "Want to add another image?" : `${count} images in your queue`}
        </strong>
        <span className="mt-1 block text-sm font-medium text-[#5d6886]">
          Paste again with Cmd+V or choose more files. New images will be added to this upload queue.
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-extrabold text-[#075df6] ring-1 ring-blue-200 transition hover:bg-blue-50"
          type="button"
          onClick={onReadClipboard}
        >
          <Clipboard className="h-4 w-4" strokeWidth={2.2} />
          Paste
        </button>
        <button
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-extrabold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
          type="button"
          onClick={onChooseFile}
        >
          <Plus className="h-4 w-4" strokeWidth={2.3} />
          Add files
        </button>
      </div>
    </div>
  );
}

function PasteZone({ isDragging, onChooseFile, onDragLeave, onDragOver, onDrop, onReadClipboard }) {
  return (
    <div
      className={`grid min-h-[340px] place-items-center rounded-xl border-2 border-dashed p-5 text-center transition ${
        isDragging
          ? "border-[#075df6] bg-blue-50"
          : "border-blue-200 bg-white"
      }`}
      role="region"
      tabIndex={0}
      aria-label="Paste, drop, or choose an image"
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="grid justify-items-center">
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-xl bg-blue-50 text-[#075df6] ring-1 ring-blue-100">
          <Images className="h-7 w-7" strokeWidth={2.1} />
        </div>
        <h2 className="text-2xl font-black">Paste images here</h2>
        <p className="mt-3 max-w-[420px] text-base font-medium leading-relaxed text-[#3f4a65]">
          Use Cmd+V, drag image files, or choose one or more files to review before upload.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button
            className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-lg bg-[#075df6] px-5 text-base font-black text-white shadow-[0_12px_28px_rgba(7,93,246,0.24)] transition hover:bg-[#074bd5]"
            type="button"
            onClick={onReadClipboard}
          >
            <Clipboard className="h-5 w-5" strokeWidth={2.1} />
            Paste image
          </button>
          <button
            className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 text-base font-black text-[#111827] transition hover:bg-slate-50"
            type="button"
            onClick={onChooseFile}
          >
            <FolderOpen className="h-5 w-5" strokeWidth={2.1} />
            Choose files
          </button>
        </div>
        <p className="mt-4 text-sm font-bold text-[#5d6886]">PNG, JPG, WEBP, SVG</p>
      </div>
    </div>
  );
}

function AssetQueue({ items, selectedItemId, onSelect, onRemove }) {
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-black">Upload queue</h2>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-extrabold text-[#075df6]">
          {items.length} {items.length === 1 ? "image" : "images"}
        </span>
      </div>
      <div className="grid max-h-[220px] gap-2 overflow-auto pr-1">
        {items.map((item) => {
          const safeName = `${sanitizeFilename(item.fileBaseName) || "asset"}${item.uploadExtension || item.extension}`;
          const isSelected = item.id === selectedItemId;

          return (
            <div
              key={item.id}
              className={`grid grid-cols-[48px_1fr_auto] items-center gap-3 rounded-lg border p-2 text-left transition ${
                isSelected ? "border-[#075df6] bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <button
                className="overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                type="button"
                onClick={() => onSelect(item.id)}
                aria-label={`Edit ${safeName}`}
              >
                <img className="aspect-square h-12 w-12 object-cover" src={item.previewUrl} alt="" />
              </button>
              <button className="min-w-0 text-left" type="button" onClick={() => onSelect(item.id)}>
                <strong className="block truncate text-sm font-black">{safeName}</strong>
                <span className="mt-1 block text-xs font-medium text-[#5d6886]">
                  {formatBytes(item.file.size)} · {item.status === "uploading" ? "Uploading" : "Ready"}
                </span>
              </button>
              <IconOnlyButton
                className="h-9 w-9 rounded-lg text-slate-600 hover:bg-white"
                type="button"
                aria-label={`Remove ${safeName}`}
                tooltip="Remove"
                tooltipPosition="left"
                onClick={() => onRemove(item.id)}
              >
                <Trash2 className="h-5 w-5" strokeWidth={2.1} />
              </IconOnlyButton>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyPreview() {
  return (
    <div className="grid min-h-[360px] place-items-center rounded-xl border border-slate-200 bg-slate-50/60 p-6 text-center">
      <div>
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-xl bg-white text-[#075df6] ring-1 ring-slate-200">
          <FileImage className="h-7 w-7" strokeWidth={2} />
        </div>
        <h3 className="text-xl font-black">No image selected</h3>
        <p className="mt-3 max-w-[360px] text-base font-medium leading-relaxed text-[#5d6886]">
          Paste one image or several images on the left to preview, rename, and upload them.
        </p>
      </div>
    </div>
  );
}

function SocialLink({ href, label, children }) {
  return (
    <a
      className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-[#075df6] hover:bg-blue-50 hover:text-[#075df6]"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
    >
      {children}
    </a>
  );
}

function IconOnlyButton({
  children,
  className = "",
  tooltip,
  tooltipPosition = "top",
  ...props
}) {
  const tooltipClass =
    tooltipPosition === "left"
      ? "right-full top-1/2 mr-2 -translate-y-1/2"
      : "bottom-full left-1/2 mb-2 -translate-x-1/2";

  return (
    <button
      className={`group relative grid place-items-center transition ${className}`}
      title={tooltip || undefined}
      {...props}
    >
      {children}
      {tooltip ? (
        <span
          className={`pointer-events-none absolute ${tooltipClass} z-50 whitespace-nowrap rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100`}
          role="tooltip"
        >
          {tooltip}
        </span>
      ) : null}
    </button>
  );
}

function Toast({ toast, onClose }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const showFrame = window.requestAnimationFrame(() => setIsVisible(true));
    const hideTimeout = window.setTimeout(
      () => setIsVisible(false),
      toast.type === "error" ? 6700 : 4200
    );
    const closeTimeout = window.setTimeout(
      onClose,
      toast.type === "error" ? 7000 : 4500
    );

    return () => {
      window.cancelAnimationFrame(showFrame);
      window.clearTimeout(hideTimeout);
      window.clearTimeout(closeTimeout);
    };
  }, [onClose, toast.type]);


  const styles = {
    success: "border-green-200 bg-green-50 text-green-800",
    error: "border-red-200 bg-red-50 text-red-700",
    info: "border-blue-200 bg-blue-50 text-[#074bd5]",
  };
  const iconStyles = {
    success: "bg-green-600 text-white",
    error: "bg-red-600 text-white",
    info: "bg-[#075df6] text-white",
  };
  const Icon = toast.type === "success" ? Check : toast.type === "error" ? X : Upload;

  return (
    <div
      className={`fixed right-5 top-5 z-50 grid w-[min(520px,calc(100vw-40px))] grid-cols-[auto_1fr_auto] items-center gap-4 rounded-xl border px-5 py-4 shadow-[0_20px_60px_rgba(16,24,40,0.16)] transition-all duration-300 ${
        isVisible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
      } ${
        styles[toast.type] || styles.info
      }`}
      role="status"
    >
      <span className={`grid h-10 w-10 place-items-center rounded-full ${iconStyles[toast.type] || iconStyles.info}`}>
        <Icon className="h-6 w-6" strokeWidth={2.4} />
      </span>
      <span>
        <strong className="block text-lg font-black">{toast.title}</strong>
        <span className="block text-base font-medium">{toast.message}</span>
      </span>
      <button
        className="grid h-9 w-9 place-items-center rounded-lg text-current transition hover:bg-white/70"
        type="button"
        aria-label="Dismiss message"
        onClick={onClose}
      >
        <X className="h-5 w-5" strokeWidth={2.2} />
      </button>
    </div>
  );
}

async function prepareFileForWebflowUpload(file, optimizeLargeFiles, setToast) {
  let uploadFile = file;

  if (await hasSvgContent(file)) {
    setToast({
      type: "info",
      title: "Converting SVG",
      message: "Creating a safe PNG before uploading to Webflow.",
    });
    uploadFile = await rasterizeSvgToPng(file);
  }

  if (uploadFile.size <= WEBFLOW_IMAGE_LIMIT_BYTES) {
    return uploadFile;
  }

  if (!optimizeLargeFiles) {
    throw new Error("This image is over Webflow's 4 MB image limit. Turn on optimization or choose a smaller file.");
  }

  if (!canOptimizeImage(uploadFile)) {
    throw new Error("This image is over 4 MB and cannot be safely optimized in-browser. Use a PNG, JPG, WebP, or AVIF image.");
  }

  setToast({
    type: "info",
    title: "Optimizing image",
    message: `Reducing ${uploadFile.name} below Webflow's 4 MB image limit.`,
  });

  const optimizedFile = await optimizeImageForWebflow(uploadFile);
  if (optimizedFile.size > WEBFLOW_IMAGE_LIMIT_BYTES) {
    throw new Error(
      `The optimized image is still ${formatBytes(optimizedFile.size)}. Try exporting a smaller image from Figma.`
    );
  }

  return optimizedFile;
}

function canOptimizeImage(file) {
  return ["image/png", "image/jpeg", "image/webp", "image/avif"].includes(file.type);
}

async function hasSvgContent(file) {
  if (!file) {
    return false;
  }

  if (isSvgFile(file)) {
    return true;
  }

  const prefix = await file.slice(0, SVG_SNIFF_BYTES).text();
  const normalizedPrefix = prefix.replace(/^\uFEFF/, "").trimStart();

  if (/^(<\?xml|<!--|<svg[\s>])/i.test(normalizedPrefix)) {
    return true;
  }

  return /<svg[\s>]/i.test(normalizedPrefix);
}

async function rasterizeSvgToPng(file) {
  const svgMarkup = await file.text();
  const sanitizedSvg = sanitizeSvgMarkup(svgMarkup);
  const svgBlob = new Blob([sanitizedSvg], { type: "image/svg+xml" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await loadImage(svgUrl);
    const { width, height } = getRasterSize(image, sanitizedSvg);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, RASTERIZED_SVG_TYPE);

    return new File([blob], replaceExtension(file.name, RASTERIZED_SVG_EXTENSION), {
      type: RASTERIZED_SVG_TYPE,
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not convert this SVG to PNG."));
    image.src = src;
  });
}

function getRasterSize(image, svgMarkup) {
  const doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const svg = doc.querySelector("svg");
  const viewBox = svg?.getAttribute("viewBox")?.split(/[\s,]+/).map(Number) || [];
  const viewBoxWidth = Number.isFinite(viewBox[2]) ? viewBox[2] : 0;
  const viewBoxHeight = Number.isFinite(viewBox[3]) ? viewBox[3] : 0;
  const width = parseSvgLength(svg?.getAttribute("width")) || image.naturalWidth || viewBoxWidth || 1024;
  const height = parseSvgLength(svg?.getAttribute("height")) || image.naturalHeight || viewBoxHeight || 1024;

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

function parseSvgLength(value) {
  if (!value || /%$/.test(value)) {
    return 0;
  }

  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

async function optimizeImageForWebflow(file) {
  const bitmap = await createImageBitmap(file);
  let width = bitmap.width;
  let height = bitmap.height;
  let quality = 0.92;
  let blob = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    blob = await renderBitmapToBlob(bitmap, width, height, quality);
    if (blob.size <= WEBFLOW_IMAGE_LIMIT_BYTES) {
      break;
    }

    if (quality > 0.72) {
      quality -= 0.08;
    } else {
      width = Math.max(1, Math.round(width * 0.82));
      height = Math.max(1, Math.round(height * 0.82));
      quality = 0.82;
    }
  }

  bitmap.close?.();
  if (!blob) {
    throw new Error("Could not optimize this image.");
  }

  return new File([blob], replaceExtension(file.name, OPTIMIZED_EXTENSION), {
    type: OPTIMIZED_IMAGE_TYPE,
    lastModified: Date.now(),
  });
}

function renderBitmapToBlob(bitmap, width, height, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, width, height);

  return canvasToBlob(canvas, OPTIMIZED_IMAGE_TYPE, quality);
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Could not render optimized image."));
        }
      },
      type,
      quality
    );
  });
}

async function resolveImagesFromClipboardItems(clipboardItems) {
  const files = [];

  for (const item of clipboardItems) {
    const textType = item.types.find((type) => type === "text/plain" || type === "text/html");
    if (!textType) {
      continue;
    }

    const textBlob = await item.getType(textType);
    const svgMarkup = extractSvgMarkup(await textBlob.text());
    if (svgMarkup) {
      files.push(svgMarkupToFile(svgMarkup));
    }
  }

  if (files.length) {
    return files;
  }

  for (const item of clipboardItems) {
    const imageType = item.types.find((type) => type.startsWith(ACCEPTED_IMAGE_PREFIX));
    if (!imageType) {
      continue;
    }

    const blob = await item.getType(imageType);
    files.push(blobToFile(blob, makeDefaultFilename(blob.type, "pasted-image")));
  }

  return files;
}

async function resolveImagesFromDataTransfer(dataTransfer) {
  const files = [];
  const html = dataTransfer?.getData?.("text/html");
  const htmlSvg = html ? extractSvgMarkup(html) : "";
  if (htmlSvg) {
    return [svgMarkupToFile(htmlSvg)];
  }

  const text = dataTransfer?.getData?.("text/plain")?.trim();
  const textSvg = text ? extractSvgMarkup(text) : "";
  if (textSvg) {
    return [svgMarkupToFile(textSvg)];
  }

  files.push(...getImageFilesFromDataTransfer(dataTransfer));
  if (files.length) {
    return files;
  }

  const imageSource = html ? getImageSourceFromHtml(html) : "";
  if (imageSource && looksLikeImageSource(imageSource)) {
    return [await imageSourceToFile(imageSource)];
  }

  if (text && looksLikeImageSource(text)) {
    return [await imageSourceToFile(text)];
  }

  return [];
}

function getImageFilesFromDataTransfer(dataTransfer) {
  if (!dataTransfer) {
    return [];
  }

  const files = Array.from(dataTransfer.files || []);
  const imageFiles = files.filter(isImageFile);
  if (imageFiles.length) {
    return imageFiles;
  }

  const items = Array.from(dataTransfer.items || []);
  const itemFiles = [];
  for (const item of items) {
    if (item.kind === "file") {
      const itemFile = item.getAsFile();
      if (isImageFile(itemFile)) {
        itemFiles.push(itemFile);
      }
    }
  }

  return itemFiles;
}

function getImageSourceFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const img = doc.querySelector("img[src]");
  return img?.getAttribute("src") || "";
}

function extractSvgMarkup(value) {
  if (!value || value.length > SVG_EXTRACTION_CHAR_LIMIT || !/<svg[\s>]/i.test(value)) {
    return "";
  }

  const doc = new DOMParser().parseFromString(value, "text/html");
  const svg = doc.querySelector("svg");
  if (svg) {
    return serializeSvg(svg.outerHTML);
  }

  const match = value.match(/<svg[\s\S]*?<\/svg>/i);
  return match ? serializeSvg(match[0]) : "";
}

function serializeSvg(svgMarkup) {
  const trimmedMarkup = sanitizeSvgMarkup(svgMarkup);
  if (!trimmedMarkup) {
    return "";
  }

  if (/xmlns=("|')http:\/\/www\.w3\.org\/2000\/svg\1/i.test(trimmedMarkup)) {
    return trimmedMarkup;
  }

  return trimmedMarkup.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
}

function sanitizeSvgMarkup(svgMarkup) {
  const withoutDeclarations = svgMarkup
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!ENTITY[\s\S]*?>/gi, "");
  const doc = new DOMParser().parseFromString(withoutDeclarations, "image/svg+xml");

  if (doc.querySelector("parsererror")) {
    throw new Error("This SVG could not be parsed safely.");
  }

  const blockedElements = ["script", "foreignObject", "iframe", "object", "embed", "link", "meta"];
  doc.querySelectorAll(blockedElements.join(",")).forEach((element) => element.remove());

  doc.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name;
      const value = attribute.value.trim();

      if (/^on/i.test(name)) {
        element.removeAttribute(name);
        return;
      }

      if ((name === "href" || name === "xlink:href" || name === "src") && isExternalReference(value)) {
        element.removeAttribute(name);
        return;
      }

      if ((name === "style" || name === "filter" || name === "clip-path" || name === "mask") && hasExternalReference(value)) {
        element.removeAttribute(name);
      }
    });
  });

  const svg = doc.querySelector("svg");
  if (!svg) {
    throw new Error("This SVG does not contain a valid svg element.");
  }

  if (!svg.getAttribute("xmlns")) {
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }

  return new XMLSerializer().serializeToString(svg);
}

function isExternalReference(value) {
  return /^(https?:|\/\/|javascript:|data:text\/html)/i.test(value);
}

function hasExternalReference(value) {
  return /url\(\s*['"]?(https?:|\/\/|javascript:|data:text\/html)/i.test(value);
}

function looksLikeImageSource(value) {
  return (
    value.startsWith("data:image/") ||
    /^https?:\/\/.+\.(png|jpe?g|webp|gif|svg|avif|bmp|ico)(\?.*)?$/i.test(value)
  );
}

async function imageSourceToFile(source) {
  if (source.startsWith("data:image/")) {
    const response = await fetch(source);
    const blob = await response.blob();
    return blobToFile(blob, makeDefaultFilename(blob.type, "pasted-image"));
  }

  const response = await fetch(source, { mode: "cors" });
  if (!response.ok) {
    throw new Error(`Could not fetch pasted image URL (${response.status}).`);
  }

  const blob = await response.blob();
  if (!blob.type.startsWith(ACCEPTED_IMAGE_PREFIX)) {
    throw new Error("The pasted URL did not resolve to an image.");
  }

  return blobToFile(blob, filenameFromUrl(source, blob.type));
}

function isImageFile(file) {
  return Boolean(file && (file.type.startsWith(ACCEPTED_IMAGE_PREFIX) || /\.svg$/i.test(file.name)));
}

function isSvgFile(file) {
  return Boolean(file && (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)));
}

function createRenamedFile(file, rawName) {
  const name = ensureImageExtension(sanitizeFilename(rawName), file.type);
  if (!name) {
    return null;
  }

  return new File([file], name, {
    type: file.type,
    lastModified: file.lastModified || Date.now(),
  });
}

function svgMarkupToFile(svgMarkup) {
  const blob = new Blob([svgMarkup], { type: "image/svg+xml" });
  const suggestedName = getSvgSuggestedName(svgMarkup);
  const filename = suggestedName
    ? ensureImageExtension(sanitizeFilename(suggestedName), "image/svg+xml")
    : makeDefaultFilename("image/svg+xml", "pasted-svg");

  return blobToFile(blob, filename);
}

function getDisplayFilename(file) {
  const cleanName = sanitizeFilename(file.name || "");
  if (cleanName && !isGenericFilename(cleanName)) {
    return ensureImageExtension(cleanName, file.type);
  }

  return makeDefaultFilename(file.type, "pasted-image");
}

function blobToFile(blob, name) {
  return new File([blob], name, {
    type: blob.type,
    lastModified: Date.now(),
  });
}

function createAssetItemId() {
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sanitizeFilename(name) {
  return name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "");
}

function sanitizeDisplayFilename(name) {
  return name
    .replace(/\s+/g, " ")
    .replace(/[^a-zA-Z0-9 ._-]/g, "")
    .replace(/^\.+/, "");
}

function ensureImageExtension(name, mimeType) {
  if (!name) {
    return "";
  }

  if (/\.[a-z0-9]+$/i.test(name)) {
    return name;
  }

  return `${name}.${extensionFromMimeType(mimeType)}`;
}

function splitFilename(name, mimeType) {
  const fallbackExtension = `.${extensionFromMimeType(mimeType)}`;
  const match = name.match(/^(.*?)(\.[a-z0-9]+)$/i);
  if (!match) {
    return { basename: name, extension: fallbackExtension };
  }

  return { basename: match[1], extension: match[2] };
}

function replaceExtension(name, extension) {
  const cleanExtension = extension.replace(/^\./, "");
  if (!name) {
    return `webflow-asset.${cleanExtension}`;
  }

  return name.replace(/\.[a-z0-9]+$/i, "") + `.${cleanExtension}`;
}

function isGenericFilename(name) {
  return /^(image|blob|clipboard|pasted-image|webflow-asset|untitled)([-_.]?\d+)?(\.[a-z0-9]+)?$/i.test(name);
}

function makeDefaultFilename(mimeType, prefix = "assetpaste-image") {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
    .replace("T", "-");

  return `${prefix}-${timestamp}.${extensionFromMimeType(mimeType)}`;
}

function filenameFromUrl(source, mimeType) {
  try {
    const url = new URL(source);
    const rawName = decodeURIComponent(url.pathname.split("/").pop() || "");
    return ensureImageExtension(sanitizeFilename(rawName), mimeType) || makeDefaultFilename(mimeType, "linked-image");
  } catch {
    return makeDefaultFilename(mimeType, "linked-image");
  }
}

function getSvgSuggestedName(svgMarkup) {
  const doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const svg = doc.querySelector("svg");
  const title = doc.querySelector("title")?.textContent;
  const label = svg?.getAttribute("aria-label");
  const id = svg?.getAttribute("id");

  return [title, label, id].find((value) => sanitizeFilename(value || ""));
}

function createShortAltText(basename, file) {
  const readableName = basename
    .replace(/\b(pasted|assetpaste|webflow|asset|image|img|copy|screenshot)\b/gi, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\b\d{2,4}x\d{2,4}\b/gi, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!readableName || isGenericFilename(basename)) {
    return file?.type === "image/svg+xml" ? "SVG image" : "Pasted image";
  }

  const words = readableName
    .split(" ")
    .filter(Boolean)
    .slice(0, 8);

  if (!words.length) {
    return "Pasted image";
  }

  const phrase = words.join(" ").toLowerCase();
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

function extensionFromMimeType(mimeType) {
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/avif": "avif",
    "image/bmp": "bmp",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico",
  };

  return map[mimeType] || "png";
}

function labelFromMimeType(mimeType) {
  const map = {
    "image/jpeg": "JPG",
    "image/png": "PNG",
    "image/webp": "WEBP",
    "image/gif": "GIF",
    "image/svg+xml": "SVG",
    "image/avif": "AVIF",
    "image/bmp": "BMP",
    "image/x-icon": "ICO",
    "image/vnd.microsoft.icon": "ICO",
  };

  return map[mimeType] || "Image";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error || "Something went wrong.");
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
