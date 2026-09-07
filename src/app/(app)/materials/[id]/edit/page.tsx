import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { toMaterialDTO } from "@/lib/materials/dto";
import { requirePagePermission } from "@/lib/materials/page-guard";
import { getMaterial } from "@/lib/materials/queries";

import { MaterialForm } from "../../_components/MaterialForm";

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { db } = await requirePagePermission("materials:write");
  const { id } = await params;
  const material = await db.material.findUnique({ where: { id }, select: { code: true } });
  return { title: material ? `Edit ${material.code}` : "Edit material" };
}

export default async function EditMaterialPage({ params }: { params: Promise<Params> }) {
  const { db } = await requirePagePermission("materials:write");
  const { id } = await params;
  const material = await getMaterial(db, id);
  if (!material) notFound();
  const dto = toMaterialDTO(material);

  return (
    <>
      <PageHeader
        title={`Edit ${dto.code}`}
        description={dto.name}
        breadcrumbs={[
          { label: "Materials", href: "/materials" },
          { label: dto.code, href: `/materials/${dto.id}` },
          { label: "Edit" },
        ]}
      />
      <div className="max-w-3xl rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:p-6">
        <MaterialForm material={dto} cancelHref={`/materials/${dto.id}`} />
      </div>
    </>
  );
}
