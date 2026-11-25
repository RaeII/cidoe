import type { SVGProps } from "react"

import { cn } from "@/lib/utils"

type IconProps = Omit<SVGProps<SVGSVGElement>, "viewBox" | "children">

// Ícones da grade do DS (pixel = 1 unidade do viewBox). Uma cor: herdam currentColor.
// Furos (janelas do edifício) via evenodd, então mostram o fundo por trás.
function pixelIcon(name: string, viewBox: string, width: number, height: number, d: string) {
  function PixelIcon({ className, ...props }: IconProps) {
    return (
      <svg
        viewBox={viewBox}
        width={width}
        height={height}
        shapeRendering="crispEdges"
        aria-hidden="true"
        className={cn("shrink-0", className)}
        {...props}
      >
        <path fill="currentColor" fillRule="evenodd" d={d} />
      </svg>
    )
  }
  PixelIcon.displayName = name
  return PixelIcon
}

export const PixelClose = pixelIcon("PixelClose", "0 0 7 7", 14, 14, "M0 0h2v2h-2zM5 0h2v2h-2zM2 2h3v3h-3zM0 5h2v2h-2zM5 5h2v2h-2z")
export const PixelCheck = pixelIcon("PixelCheck", "0 1 10 6", 15, 9, "M8 1h2v1h-2zM7 2h2v1h-2zM6 3h2v1h-2zM0 4h2v1h-2zM5 4h2v1h-2zM1 5h2v1h-2zM4 5h2v1h-2zM2 6h3v1h-3z")
export const PixelChevronDown = pixelIcon("PixelChevronDown", "0 0 7 4", 14, 8, "M0 0h7v1h-7zM1 1h5v1h-5zM2 2h3v1h-3zM3 3h1v1h-1z")
/** Cursor de menu ▸ — marca a opção ativa. */
export const PixelArrow = pixelIcon("PixelArrow", "0 0 4 7", 6, 10, "M0 0h1v7h-1zM1 1h1v5h-1zM2 2h1v3h-1zM3 3h1v1h-1z")
export const PixelHeart = pixelIcon("PixelHeart", "0 0 8 6", 16, 12, "M1 0h2v1h-2zM5 0h2v1h-2zM0 1h8v2h-8zM1 3h6v1h-6zM2 4h4v1h-4zM3 5h2v1h-2z")
/** Cadeado: opção ou recurso bloqueado. Fechadura vazada mostra o fundo. */
export const PixelLock = pixelIcon("PixelLock", "0 0 7 8", 11, 12, "M2 0h3v1h-3zM1 1h1v2h-1zM5 1h1v2h-1zM0 3h7v5h-7zM3 5h1v2h-1z")
export const PixelUpload = pixelIcon("PixelUpload", "0 0 8 8", 12, 12, "M3 0h2v1h-2zM2 1h4v1h-4zM1 2h6v1h-6zM3 3h2v3h-2zM0 6h1v1h-1zM7 6h1v1h-1zM0 7h8v1h-8z")
export const PixelInfo = pixelIcon("PixelInfo", "0 0 5 6", 10, 12, "M2 0h2v1h-2zM1 2h3v1h-3zM2 3h2v2h-2zM1 5h4v1h-4z")
/** Imagem (moldura + morro), uma cor: espaço reservado para imagem do usuário. */
export const PixelImage = pixelIcon("PixelImage", "0 0 10 8", 20, 16, "M0 0h10v1h-10zM0 1h1v6h-1zM9 1h1v6h-1zM0 7h10v1h-10zM6 2h2v2h-2zM2 5h1v1h-1zM1 6h3v1h-3zM5 4h1v1h-1zM4 5h3v1h-3zM3 6h6v1h-6z")
export const PixelPaw = pixelIcon("PixelPaw", "0 0 9 8", 14, 12, "M2 0h2v2h-2zM5 0h2v2h-2zM0 2h2v2h-2zM7 2h2v2h-2zM3 3h3v1h-3zM2 4h5v1h-5zM1 5h7v2h-7zM2 7h2v1h-2zM5 7h2v1h-2z")
export const PixelBuilding = pixelIcon(
  "PixelBuilding",
  "0 0 8 8",
  16,
  16,
  "M2 0h4v1h-4zM1 1h6v7h-6zM2 2h1v1h-1zM5 2h1v1h-1zM2 4h1v1h-1zM5 4h1v1h-1zM3 6h2v2h-2z",
)

/** Moeda âmbar: XP, conquista, recompensa. Cor fixa — a moeda é sempre âmbar. */
export function PixelCoin({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 8 8" width={16} height={16} shapeRendering="crispEdges" aria-hidden="true" className={cn("shrink-0", className)} {...props}>
      <path fill="var(--color-ambar)" d="M2 0h4v1h-4zM1 1h6v1h-6zM0 2h8v4h-8zM1 6h6v1h-6zM2 7h4v1h-4z" />
      <path fill="var(--color-ambar-700)" d="M3 2h2v4h-2z" />
    </svg>
  )
}

/** Presente âmbar: recompensa a conquistar. Cor fixa, como a moeda; fita e laço no tom 700.
 *  Tampa em `<g data-lid>` (overflow visível) pra placa do visitante abrir o presente. */
export function PixelGift({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 8 8" width={16} height={16} shapeRendering="crispEdges" overflow="visible" aria-hidden="true" className={cn("shrink-0", className)} {...props}>
      <path fill="var(--color-ambar)" d="M1 4h6v4h-6z" />
      <path fill="var(--color-ambar-700)" d="M3 4h2v4h-2z" />
      <g data-lid>
        <path fill="var(--color-ambar)" d="M0 2h8v2h-8z" />
        <path fill="var(--color-ambar-700)" d="M1 0h2v1h-2zM5 0h2v1h-2zM2 1h4v1h-4zM3 2h2v2h-2zM0 3h8v1h-8z" />
      </g>
    </svg>
  )
}

/** Logo oficial (public/): verde-oliva no claro, branca no escuro. */
export function CidoeLogo({ className }: { className?: string }) {
  return (
    <>
      <img src="/logo.webp" alt="" width={28} height={28} className={cn("shrink-0 dark:hidden", className)} />
      <img src="/logo-branca.webp" alt="" width={28} height={28} className={cn("hidden shrink-0 dark:block", className)} />
    </>
  )
}

/** Marca em vetor, em partes soltas para animar (loading, aviso de pré-lançamento). Espaço `266 162 742 958`. */
export const LOGO_PATHS = {
  left: "M601.1 1103.5C600.9 1096.7 598.3 1090.4 593.4 1085C589 1080.1 585.1 1078 575.4 1075.1C562.8 1071.4 562 1069.3 561.3 1039.1C560.5 1006 562 998.8 574.2 978.8C579.8 969.7 584.1 955.2 584.8 943.8C585.5 929.9 583.9 921.5 575.4 896.5C566.7 870.6 565 863.8 565 854.8C565 842.2 569 833.7 581.5 819.8C592.6 807.5 597 796.5 597 781.2C597 750.3 572.8 728.7 550 739.1C547 740.5 540.6 744.6 535.9 748.2C524.8 756.7 522.7 757.7 513.8 759.1C490 762.8 476.6 768.8 462.8 781.8C452.7 791.4 446.7 800.4 441 814.3C436.2 826.1 434.1 830.2 428.6 838.8C415.6 858.9 417.3 881.4 433.2 897.3L438 902.1 L435 907.4C428 919.7 419.4 927.9 387.4 952.5C354.5 977.8 336.2 1007.1 331 1042.8L329.8 1051 L326.8 1047.2C320.7 1039.7 317 1027.5 317 1014.2C317 1007.3 320.6 979.5 325 952.8C330.5 918.8 335.1 890.1 337 878C338.1 870.6 340.1 857.8 341.5 849.5C342.8 841.2 346 821.7 348.5 806C351 790.3 353.5 774.8 354 771.5C354.5 768.2 358.4 744.4 362.5 718.5C366.6 692.6 372.9 653.7 376.5 632C380 610.3 385.2 578.5 388 561.5C394.7 520 398.1 509.6 409.4 494.5C417.1 484.3 423.8 478.8 457.5 455.3C483.4 437.2 497.5 427.5 538 399.5C548.4 392.3 577.6 372 584.1 367.4C617 344.3 618 343.7 623.4 343.7C629.5 343.7 633.2 345.8 635.8 351L638 355.4 L638 712.5C638 1103 638.4 1076 632.3 1087.2C627.3 1096.4 614.3 1106 603.9 1108.4C601.4 1108.9 601.3 1108.8 601.1 1103.5Z",
  right: "M639.2 1108.7C647.8 1100.1 652.8 1092.1 655.2 1083.1C656.8 1076.9 656.9 1053.5 656.9 716.2C657 399.8 657.2 355.6 658.5 353C660.4 349.4 665.5 347.5 669.5 349C671 349.6 683.6 358.5 697.4 368.8C711.2 379.2 732 394.5 743.5 403C803.4 446.8 849.4 481.5 853.6 486.1C863.4 496.8 869.5 508.8 872.5 522.9C873.2 526.5 875.7 541 878 555C891.2 636.7 901.2 698.7 902.5 707C903.3 712.2 905.4 724.4 907 734C909.7 750.1 919.7 812.4 930.6 880.5C933 895.9 937.5 923.6 940.5 942C943.5 960.4 947.1 983.1 948.5 992.5C953.3 1024.2 960 1063.5 961.6 1069C967 1088 979.7 1101.2 997.5 1106.6C1004.8 1108.8 1004.3 1108.4 1003.5 1111C1001.8 1116.2 1010 1116 814 1116L631.9 1116 L639.2 1108.7Z",
  dog: "M344 1115.3C310.5 1109.7 285.3 1089.3 275.6 1060C269.4 1041.2 270 1017.8 277.2 1003.6C286.2 985.5 302.4 977.8 305.5 990.1C305.8 991.5 305.1 997.3 303.9 1003.1C298.8 1027.3 302.9 1048.1 315.9 1063.3C324.5 1073.5 334.9 1079.8 345.8 1081.6L349.5 1082.2 L348.6 1071.8C346.4 1047.8 352.5 1023.3 366.2 1001.3C374 988.7 392.4 970.4 412.9 955C435.5 938 447.7 925.1 455.6 909.8L458 905 L467.9 905C485.2 905 495.8 900 503.9 888C509.8 879.1 511.3 873 510.7 860.6C510.5 855.1 509.5 848.2 508.6 845.3C506.5 838.6 500.9 830.6 498.2 830.2C495.5 829.8 495.5 829.1 498.7 841.3C502.2 854.8 502.3 867.8 499 876.4C491 897.2 462.5 901.2 446.3 883.7C441.1 878.1 439.5 873.4 439.6 864C439.6 855.6 439.9 854.9 449 840.9C452.3 835.8 455.7 829.3 456.6 826.6C457.5 823.8 460.2 817.3 462.7 812.1C471 794.7 487.4 781.9 505.1 779C529 775.2 533.4 773.5 544.5 764.5C556.2 754.9 562 753.2 568.1 757.3C573.7 761.1 577.3 769.7 577.8 780.5C578.4 793.5 576.6 797.6 564 812C548.7 829.5 545.3 838.1 546.3 857C546.9 869.1 549.1 877.8 556 896.6C564.2 918.6 565.5 924.6 565.4 939.5C565.4 955.1 563.8 960.6 555.3 974.8C545.1 991.8 542.2 1001.7 541.3 1023.1C540.7 1037.8 542.3 1059.8 544.6 1068.8C547.7 1080.4 550.2 1082.9 563.3 1086.9C571.3 1089.4 577.3 1093.1 578.9 1096.6C580.5 1100.2 580.3 1108.2 578.4 1110.8C574.6 1116.3 580.4 1116 458.8 1115.9C397 1115.8 345.4 1115.5 344 1115.3Z",
  cat: "M736.8 385.6C732.6 382.6 725.4 377.3 720.8 373.8C716.2 370.4 707.8 364.1 702.2 360C674.3 339.6 673.9 339.3 669.9 330C667.9 325.3 665.7 321.5 664.9 321.5C663.5 321.5 661.5 326.3 660.5 332.4L659.9 336.2 L648.5 335.9C642.3 335.7 636.9 335.3 636.7 335C636.4 334.7 637 330.9 638.1 326.5C643.7 303.8 640.4 279.3 630.5 270L628.2 267.8 L619.7 272C615 274.3 609.2 276.4 606.8 276.7C595.8 278 587.1 271.8 585.1 261.5C584.5 258.2 583.3 254.4 582.5 253C578.3 245.9 576.8 241.3 576.3 234.4L575.7 226.9 L570 222.5C561.5 216 558.9 211.1 561.1 205.9C562.7 201.8 565.8 200.5 580.2 197.4C587 196 592.9 194.4 593.4 194C593.9 193.5 593.5 190.4 592.5 186.7C591.1 181.4 591 179.6 591.9 176.7C595.4 166.2 607.2 168.3 627.5 182.9C637.3 190 637.9 190.3 649.3 194.5C695.6 211.4 731.6 244.4 750.1 287C756.4 301.7 758.4 311.4 758.4 328C758.5 343.7 757.2 350.2 752.4 358.9L750 363.3 L754.9 362.7C772.2 360.7 785.6 340.3 783.4 319.5C782.4 309.9 778.5 299.3 771.5 287C758.6 264.3 755.3 255.2 756.4 244.9C758.3 226.6 770.2 214.6 786.5 214.5C794.8 214.5 798.4 216.3 800.6 221.7C802.8 226.8 801.6 230.4 795.5 237C788.5 244.6 787.8 248.5 791.4 259.3C792.8 263.6 795.1 268.7 796.4 270.8C820.4 308.9 819.8 349.6 794.8 374.3C782.5 386.5 771.6 390.9 753.9 391L744.3 391 L736.8 385.6Z",
} as const

/** Foto indisponível (DS 5.7): moldura, sol âmbar, morro verde. ×4 da grade 8×8. */
export function PixelPhoto({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 8 8" width={32} height={32} shapeRendering="crispEdges" aria-hidden="true" className={cn("shrink-0", className)} {...props}>
      <path fill="var(--color-foreground)" d="M0 0h8v1h-8zM0 1h1v6h-1zM7 1h1v6h-1zM0 7h8v1h-8z" />
      <path fill="var(--color-ambar)" d="M5 2h1v1h-1z" />
      <path fill="var(--color-verde)" d="M2 4h1v1h-1zM1 5h3v1h-3zM5 5h1v1h-1zM1 6h6v1h-6z" />
    </svg>
  )
}

/** Marca de erro do DS: "!" âmbar sobre tinta — sem vermelho. Decorativa: o texto ao lado diz o erro. */
export function ErrorMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("mt-px grid size-[18px] shrink-0 place-items-center bg-tinta font-mono text-[11px] font-semibold text-ambar", className)}
    >
      !
    </span>
  )
}

/** Gato em pixel espiando por cima de um modal (DS 6.7). Pelagem real, não cor da marca. Posicione com absolute. */
export function PixelCat({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 29 16" width={87} height={48} shapeRendering="crispEdges" aria-hidden="true" className={cn("pointer-events-none shrink-0", className)} {...props}>
      <path fill="#5E3A22" d="M5 0h1v1h-1zM23 0h1v1h-1zM5 1h2v1h-2zM22 1h2v1h-2zM5 2h1v1h-1zM7 2h1v1h-1zM21 2h1v1h-1zM23 2h1v1h-1zM5 3h1v1h-1zM8 3h1v1h-1zM20 3h1v1h-1zM23 3h1v1h-1zM5 4h1v1h-1zM9 4h11v1h-11zM23 4h1v1h-1zM4 5h1v1h-1zM24 5h1v1h-1zM4 6h1v1h-1zM24 6h1v1h-1zM4 7h1v1h-1zM24 7h1v1h-1zM4 8h1v1h-1zM24 8h1v1h-1zM4 9h1v1h-1zM24 9h1v1h-1zM3 10h1v1h-1zM25 10h1v1h-1zM3 11h1v1h-1zM25 11h1v1h-1zM3 12h1v1h-1zM25 12h1v1h-1zM3 13h2v1h-2zM8 13h1v1h-1zM20 13h1v1h-1zM24 13h2v1h-2zM4 14h1v1h-1zM6 14h1v1h-1zM8 14h1v1h-1zM20 14h1v1h-1zM22 14h1v1h-1zM24 14h1v1h-1zM5 15h3v1h-3zM21 15h3v1h-3z" />
      <path fill="#EE9A4D" d="M6 2h1v1h-1zM22 2h1v1h-1zM6 3h1v1h-1zM22 3h1v1h-1zM6 4h1v1h-1zM22 4h1v1h-1zM5 5h7v1h-7zM13 5h1v1h-1zM15 5h1v1h-1zM17 5h7v1h-7zM5 6h9v1h-9zM15 6h9v1h-9zM5 7h3v1h-3zM10 7h9v1h-9zM21 7h3v1h-3zM6 8h2v1h-2zM10 8h9v1h-9zM21 8h2v1h-2zM5 9h3v1h-3zM10 9h3v1h-3zM16 9h3v1h-3zM21 9h3v1h-3zM4 10h2v1h-2zM8 10h3v1h-3zM18 10h3v1h-3zM23 10h2v1h-2zM4 11h7v1h-7zM18 11h7v1h-7zM4 12h7v1h-7zM18 12h7v1h-7zM9 13h2v1h-2zM18 13h2v1h-2z" />
      <path fill="#CF7533" d="M12 5h1v1h-1zM14 5h1v1h-1zM16 5h1v1h-1zM14 6h1v1h-1zM5 8h1v1h-1zM23 8h1v1h-1z" />
      <path fill="#FFF5E8" d="M11 10h3v1h-3zM15 10h3v1h-3zM11 11h1v1h-1zM13 11h1v1h-1zM15 11h1v1h-1zM17 11h1v1h-1zM11 12h2v1h-2zM14 12h1v1h-1zM16 12h2v1h-2zM5 13h3v1h-3zM11 13h7v1h-7zM21 13h3v1h-3zM5 14h1v1h-1zM7 14h1v1h-1zM21 14h1v1h-1zM23 14h1v1h-1z" />
      <path fill="#F5A6AE" d="M7 3h1v1h-1zM21 3h1v1h-1zM7 4h2v1h-2zM20 4h2v1h-2zM6 10h2v1h-2zM21 10h2v1h-2z" />
      <path fill="#E2788A" d="M13 9h3v1h-3zM14 10h1v1h-1z" />
      <path fill="#2A1F1A" d="M9 7h1v1h-1zM20 7h1v1h-1zM8 8h2v1h-2zM19 8h2v1h-2zM8 9h2v1h-2zM19 9h2v1h-2zM12 11h1v1h-1zM14 11h1v1h-1zM16 11h1v1h-1zM13 12h1v1h-1zM15 12h1v1h-1z" />
      <path fill="#FFFFFF" d="M8 7h1v1h-1zM19 7h1v1h-1z" />
      <path fill="#7A5238" d="M0 10h3v1h-3zM26 10h3v1h-3zM0 12h3v1h-3zM26 12h3v1h-3z" />
    </svg>
  )
}

/** Cachorro em pixel espiando por cima de um card (DS 6.6). Posicione com absolute. */
export function PixelDog({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 16 13" width={64} height={52} shapeRendering="crispEdges" aria-hidden="true" className={cn("pointer-events-none shrink-0", className)} {...props}>
      <path fill="#4A2F1F" d="M4 0h8v1h-8zM3 1h1v1h-1zM12 1h1v1h-1zM1 2h3v1h-3zM12 2h3v1h-3zM0 3h1v1h-1zM3 3h1v1h-1zM12 3h1v1h-1zM15 3h1v1h-1zM0 4h1v1h-1zM3 4h1v1h-1zM12 4h1v1h-1zM15 4h1v1h-1zM0 5h1v1h-1zM3 5h1v1h-1zM12 5h1v1h-1zM15 5h1v1h-1zM0 6h1v1h-1zM3 6h1v1h-1zM12 6h1v1h-1zM15 6h1v1h-1zM0 7h1v1h-1zM3 7h1v1h-1zM12 7h1v1h-1zM15 7h1v1h-1zM1 8h1v1h-1zM3 8h1v1h-1zM12 8h1v1h-1zM14 8h1v1h-1zM2 9h2v1h-2zM12 9h2v1h-2zM1 10h1v1h-1zM4 10h1v1h-1zM11 10h1v1h-1zM14 10h1v1h-1zM1 11h1v1h-1zM4 11h1v1h-1zM11 11h1v1h-1zM14 11h1v1h-1zM2 12h2v1h-2zM12 12h2v1h-2z" />
      <path fill="#C98A4B" d="M4 1h8v1h-8zM4 2h8v1h-8zM4 3h8v1h-8zM4 4h1v1h-1zM7 4h2v1h-2zM11 4h1v1h-1zM4 5h1v1h-1zM7 5h2v1h-2zM11 5h1v1h-1zM5 6h1v1h-1zM10 6h1v1h-1zM4 7h1v1h-1zM11 7h1v1h-1zM4 8h1v1h-1zM11 8h1v1h-1zM4 9h1v1h-1zM11 9h1v1h-1zM2 10h2v1h-2zM5 10h1v1h-1zM10 10h1v1h-1zM12 10h2v1h-2zM2 11h2v1h-2zM12 11h2v1h-2z" />
      <path fill="#8A5530" d="M1 3h2v1h-2zM13 3h2v1h-2zM1 4h2v1h-2zM13 4h2v1h-2zM1 5h2v1h-2zM13 5h2v1h-2zM1 6h2v1h-2zM13 6h2v1h-2zM1 7h2v1h-2zM13 7h2v1h-2zM2 8h1v1h-1zM13 8h1v1h-1z" />
      <path fill="#FFFFFF" d="M5 4h1v1h-1zM9 4h1v1h-1z" />
      <path fill="#2A1E17" d="M6 4h1v1h-1zM10 4h1v1h-1zM5 5h2v1h-2zM9 5h2v1h-2zM7 7h2v1h-2zM6 8h1v1h-1zM9 8h1v1h-1zM7 9h2v1h-2z" />
      <path fill="#EF8E96" d="M4 6h1v1h-1zM11 6h1v1h-1zM7 10h2v1h-2z" />
      <path fill="#F8EBD5" d="M6 6h4v1h-4zM5 7h2v1h-2zM9 7h2v1h-2zM5 8h1v1h-1zM7 8h2v1h-2zM10 8h1v1h-1zM5 9h2v1h-2zM9 9h2v1h-2zM6 10h1v1h-1zM9 10h1v1h-1z" />
    </svg>
  )
}

/** Carregando em blocos (substitui spinner): três blocos acendem em sequência. Decorativo — acompanhe de texto. */
export function BlockLoader({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center gap-[3px]", className)}>
      {[0, 300, 600].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-block bg-current motion-reduce:animate-none"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  )
}
