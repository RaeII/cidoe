import { useAuth } from "@/hooks/useAuth";
import { useClubCatalog } from "@/components/hooks/useClubCatalog";
import { useMyClub } from "@/components/hooks/useMyClub";
import { clubImages, findClub } from "@/lib/clubs";
import { Badge } from "@/components/ui/badge";
import { PixelCheck } from "@/components/ui/pixel-icon";

/**
 * Aba Personalizações do menu da conta: imagens do telão do time do evento (destino do
 * "Ver personalizações" do modal). Sem time, carregando ou erro: nada. Lazy, como o modal.
 */
export default function MyClubImages() {
  const { user } = useAuth();
  const mine = useMyClub(user?.id);
  const { catalog } = useClubCatalog(mine.club !== null);
  const club = findClub(catalog?.clubs ?? [], mine.club);
  if (!club) return null;
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">Seu time: {club.name}</h3>
      <ul aria-label={`Imagens do telão: ${club.name}`} className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {clubImages(club).map((image) => (
          <li key={image.key} className="pixel pixel-thin overflow-hidden bg-card">
            <div className="h-24 bg-tinta p-2">
              <img src={image.url} alt={image.label} width={256} height={256} loading="lazy" decoding="async" className="size-full object-contain" />
            </div>
            <div className="px-3 pt-2 pb-3">
              <Badge><PixelCheck />Liberado</Badge>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
