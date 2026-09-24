import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Crop, RotateCcw, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";

type Point = { x: number; y: number };

interface ImageCropDialogProps {
  imageUrl: string | null;
  fileName: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}

const createCroppedFile = async (imageUrl: string, area: Area, fileName: string) => {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = imageUrl;
  await image.decode();

  const canvas = document.createElement("canvas");
  const maxWidth = 1600;
  const scale = Math.min(1, maxWidth / area.width);
  canvas.width = Math.round(area.width * scale);
  canvas.height = Math.round(area.height * scale);

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Impossible de préparer cette image.");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("Impossible d’enregistrer l’image.")),
      "image/jpeg",
      0.9,
    );
  });

  const baseName = fileName.replace(/\.[^.]+$/, "") || "produit";
  return new File([blob], `${baseName}-recadree.jpg`, { type: "image/jpeg" });
};

export function ImageCropDialog({ imageUrl, fileName, open, onCancel, onConfirm }: ImageCropDialogProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [imageAspect, setImageAspect] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setImageAspect(1);
    setCroppedArea(null);
    setError(null);
  }, [imageUrl, open]);

  const handleComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedArea(pixels);
  }, []);

  const reset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setError(null);
  };

  const confirm = async () => {
    if (!imageUrl || !croppedArea) return;
    setProcessing(true);
    setError(null);
    try {
      onConfirm(await createCroppedFile(imageUrl, croppedArea, fileName));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de recadrer cette image.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !processing) onCancel(); }}>
      <DialogContent className="max-w-2xl overflow-hidden p-0">
        <DialogHeader className="px-5 pt-5 pr-12">
          <DialogTitle className="flex items-center gap-2"><Crop className="h-5 w-5" />Recadrer l’image</DialogTitle>
          <DialogDescription>L’image est conservée entière et centrée. Zoomez seulement si vous souhaitez la recadrer.</DialogDescription>
        </DialogHeader>

        <div className="relative h-[min(58vh,520px)] w-full bg-foreground">
          {imageUrl && (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={imageAspect}
              objectFit="contain"
              minZoom={1}
              maxZoom={3}
              showGrid
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onMediaLoaded={({ naturalWidth, naturalHeight }) => {
                if (naturalWidth > 0 && naturalHeight > 0) {
                  setImageAspect(naturalWidth / naturalHeight);
                  setCrop({ x: 0, y: 0 });
                  setZoom(1);
                }
              }}
              onCropComplete={handleComplete}
            />
          )}
        </div>

        <div className="space-y-4 px-5">
          <div className="flex items-center gap-3">
            <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Slider
              aria-label="Zoom de l’image"
              min={1}
              max={3}
              step={0.05}
              value={[zoom]}
              onValueChange={(values) => setZoom(values[0] ?? 1)}
            />
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{zoom.toFixed(1)}×</span>
          </div>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2 px-5 pb-5 sm:space-x-0">
          <Button type="button" variant="ghost" onClick={reset} disabled={processing}>
            <RotateCcw />Réinitialiser
          </Button>
          <div className="flex-1" />
          <Button type="button" variant="outline" onClick={onCancel} disabled={processing}>Annuler</Button>
          <Button type="button" onClick={() => void confirm()} disabled={processing || !croppedArea}>
            {processing ? "Préparation…" : "Valider le recadrage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}