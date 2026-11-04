import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ImagePlus, Mail, Pencil, Trash2 } from "lucide-react";
import { ApiError } from "@/api/http";
import type { ProfileDetails } from "@/api/user/user.types";
import { useAuth } from "@/hooks/useAuth";
import { resizeImage } from "@/lib/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorMark, PixelCheck } from "@/components/ui/pixel-icon";
import { toast } from "@/components/ui/toast";
import { ProfileDetailsFields } from "@/components/ProfileDetailsFields";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Aba "Perfil" do GameMenu: nome, username, imagem, cidade e como conheceu. */
export function ProfilePanel() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [profileImage, setProfileImage] = useState(user?.profile_image ?? null);
  const [details, setDetails] = useState<ProfileDetails>({
    city: user?.city ?? null,
    discovery_source: user?.discovery_source ?? null,
    discovery_source_other: user?.discovery_source_other ?? null,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const initials = (user.name ?? user.username)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const imageChanged = profileImage !== (user.profile_image ?? null);
  // Texto de "Outro" só conta com "Outro" escolhido; o backend descarta nos demais.
  const detailsChanged =
    details.city?.id !== user.city?.id ||
    details.discovery_source !== user.discovery_source ||
    (details.discovery_source === "other" &&
      (details.discovery_source_other ?? "").trim() !== (user.discovery_source_other ?? ""));
  const hasChanges =
    name !== (user.name ?? "") || username !== user.username || imageChanged || detailsChanged;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await updateProfile({
        name,
        username,
        ...(imageChanged ? { profile_image: profileImage } : {}),
        city_id: details.city?.id ?? null,
        discovery_source: details.discovery_source,
        discovery_source_other: details.discovery_source_other,
      });
      toast.success("Perfil atualizado.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao atualizar o perfil");
    } finally {
      setSubmitting(false);
    }
  }

  function removeProfileImage() {
    setProfileImage(null);
    setError(null);
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setProcessingImage(true);
    try {
      setProfileImage(await resizeImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar a imagem");
    } finally {
      setProcessingImage(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="m-auto w-full max-w-xl">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={handleImageChange}
      />
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <div className="relative shrink-0">
          <Avatar size="lg">
            {profileImage && <AvatarImage src={profileImage} alt="Imagem de perfil" />}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="absolute -right-3 -bottom-3"
                disabled={processingImage || submitting}
                aria-label="Editar imagem de perfil"
              >
                <Pencil />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                <ImagePlus />
                {profileImage ? "Trocar imagem" : "Adicionar imagem"}
              </DropdownMenuItem>
              {profileImage && (
                <DropdownMenuItem variant="destructive" onSelect={removeProfileImage}>
                  <Trash2 />
                  Remover imagem
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="min-w-0">
          <p className="truncate text-xl font-semibold">{user.name || user.username}</p>
          <p className="mt-1 inline-flex max-w-full items-center gap-1.5 text-sm text-muted-foreground">
            <Mail className="size-3.5 shrink-0" />
            <span className="truncate">{user.email ?? "Sem e-mail"}</span>
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mono-label mb-2 block text-foreground">Nome</span>
          <Input
            required
            minLength={2}
            maxLength={100}
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mono-label mb-2 block text-foreground">Nome de usuário</span>
          <Input
            required
            minLength={3}
            maxLength={45}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
      </div>

      <div className="mt-5">
        <ProfileDetailsFields value={details} onChange={setDetails} />
      </div>

      {error && (
        <p role="alert" className="mt-4 flex items-start gap-2.5 text-sm text-destructive">
          <ErrorMark />
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end">
        <Button type="submit" disabled={!hasChanges || submitting || processingImage}>
          <PixelCheck />
          {submitting ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
