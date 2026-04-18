import { Node as PMNode } from "prosemirror-model";
import { titlePageSchema } from "./schema";

const { nodes } = titlePageSchema;

const emptyPara = () => nodes.para.createAndFill();

const emptyRegion = (
  name: "centerBlock" | "footerLeft" | "footerCenter" | "footerRight",
) => {
  const para = emptyPara();
  if (!para) throw new Error("titlePage: empty para failed to construct");
  return nodes[name].create(null, para);
};

export const emptyDoc = (projectTitle: string): PMNode => {
  const titleText =
    projectTitle.length > 0 ? [titlePageSchema.text(projectTitle)] : [];
  const title = nodes.title.create(null, titleText);
  return nodes.doc.create(null, [
    title,
    emptyRegion("centerBlock"),
    emptyRegion("footerLeft"),
    emptyRegion("footerCenter"),
    emptyRegion("footerRight"),
  ]);
};
