import { Tag } from "@oh-writers/ui";
import { CATEGORY_META, type BreakdownCategory } from "@oh-writers/domain";

interface Props {
  category: BreakdownCategory;
  name: string;
  quantity: number;
  onAccept: () => void;
  onIgnore: () => void;
}

export function CesareGhostTag({
  category,
  name,
  quantity,
  onAccept,
  onIgnore,
}: Props) {
  const meta = CATEGORY_META[category];
  return (
    <Tag
      variant="ghost"
      colorToken={meta.colorToken}
      icon={meta.icon}
      name={name}
      count={quantity}
      onClick={onAccept}
      onDismiss={onIgnore}
      data-testid={`ghost-tag-${name}`}
    />
  );
}
