export interface ParentWithChildren<TNode> {
  children: readonly TNode[];
}

export function getInsertIndexAboveSource<TNode>(parent: ParentWithChildren<TNode>, source: TNode): number {
  const sourceIndex = parent.children.indexOf(source);
  return sourceIndex >= 0 ? sourceIndex + 1 : parent.children.length;
}
