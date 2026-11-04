import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { ReferrerPreview } from "@/api/referral/referral.types";
import { cn } from "@/lib/utils";

export function ReferralPerson({
  label,
  person,
  className,
}: {
  label: string;
  person: ReferrerPreview;
  className?: string;
}) {
  const name = person.name?.trim() || "Usuário Cidoe";

  return (
    <div className={cn("pixel pixel-thin flex items-center gap-3 bg-card p-3", className)}>
      <Avatar>
        {person.profile_image && (
          <AvatarImage src={person.profile_image} alt={`Imagem de ${name}`} />
        )}
        <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="mono-label text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{name}</p>
      </div>
    </div>
  );
}
