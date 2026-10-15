/**
 * Choix d'une image : URL ou téléversement (bucket product-images),
 * avec recadrage optionnel avant l'envoi.
 */
import { useEffect, useState } from "react";
import { orNull } from "@/lib/format";
import { Crop } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ImageCropDialog } from "@/components/image-crop-dialog";
import { Button } from "@/components/ui/button";

export function ImagePicker({
  value,
  onChange,
}: Readonly<{
  value: string;
  onChange: (url: string) => void;
}>) {
  const [mode, setMode] = useState<"url" | "upload">(
    value && !value.includes("/storage/v1/") ? "url" : "upload",
  );
  const [uploading, setUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{
    fileName: string;
    url: string;
    local: boolean;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (selectedImage?.local) URL.revokeObjectURL(selectedImage.url);
    };
  }, [selectedImage]);

  const handleFile = async (file: File) => {
    setUploading(true);
    const ext = orNull(file.name.split(".").pop()?.toLowerCase()) ?? "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    setUploading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    onChange(data.publicUrl);
    toast.success("Image téléversée");
  };

  const chooseFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Choisissez un fichier image.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error("L’image ne doit pas dépasser 12 Mo.");
      return;
    }
    setSelectedImage({ fileName: file.name, url: URL.createObjectURL(file), local: true });
  };

  const editExistingImage = () => {
    if (!value) return;
    const fileName = orNull(value.split("/").pop()?.split("?")[0]) ?? "produit.jpg";
    setSelectedImage({ fileName, url: value, local: false });
  };

  const cancelCrop = () => setSelectedImage(null);

  const confirmCrop = (file: File) => {
    setSelectedImage(null);
    void handleFile(file);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setMode("url")}
          className={`rounded px-2 py-1 ${mode === "url" ? "bg-primary text-primary-foreground" : "border border-border"}`}
        >
          URL
        </button>
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`rounded px-2 py-1 ${mode === "upload" ? "bg-primary text-primary-foreground" : "border border-border"}`}
        >
          Téléverser
        </button>
      </div>
      {mode === "url" ? (
        <input
          className="input"
          value={value}
          placeholder="https://…"
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) chooseFile(file);
            e.target.value = "";
          }}
          className="block w-full text-xs"
        />
      )}
      {mode === "upload" && (
        <p className="text-[11px] text-muted-foreground">
          L’image sera conservée entière et centrée. Vous pourrez zoomer si nécessaire.
        </p>
      )}
      {value && (
        <div className="mt-2 flex items-end gap-3">
          <img
            src={value}
            alt="Aperçu du produit"
            className="aspect-[4/5] h-28 rounded border border-border bg-warm object-contain"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={editExistingImage}
            disabled={uploading}
          >
            <Crop />
            Modifier le cadrage
          </Button>
        </div>
      )}
      <ImageCropDialog
        imageUrl={selectedImage?.url ?? null}
        fileName={selectedImage?.fileName ?? "produit.jpg"}
        open={selectedImage !== null}
        onCancel={cancelCrop}
        onConfirm={confirmCrop}
      />
    </div>
  );
}
