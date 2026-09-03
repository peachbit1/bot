import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * One-shot admin login bootstrap for production.
 * Enabled only when BOOTSTRAP_ADMIN_ENABLED=1.
 * Auth: header X-Bootstrap-Secret === BOOTSTRAP_ADMIN_SECRET (or AUTH_SECRET).
 */
export async function POST(req: NextRequest) {
  if (process.env.BOOTSTRAP_ADMIN_ENABLED !== "1") {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }

  const expected =
    process.env.BOOTSTRAP_ADMIN_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "";
  const got = req.headers.get("x-bootstrap-secret")?.trim() || "";
  if (!expected || got !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    name?: string;
  };

  const email = (body.email || "admin@peachbitch.local").trim().toLowerCase();
  const password = body.password || "";
  const name = (body.name || "Олег").trim() || "Олег";

  if (password.length < 8) {
    return NextResponse.json(
      { error: "password must be at least 8 chars" },
      { status: 400 },
    );
  }

  const ranked = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      source: true,
      _count: { select: { galleryItems: true, characters: true } },
    },
  });
  ranked.sort(
    (a, b) =>
      b._count.galleryItems +
      b._count.characters -
      (a._count.galleryItems + a._count.characters),
  );

  const owner =
    ranked.find(
      (u) =>
        !u.email.includes("@peachbitch.internal") &&
        !u.email.startsWith("tg_") &&
        u.source === "web",
    ) ||
    ranked.find(
      (u) =>
        !u.email.includes("@peachbitch.internal") && !u.email.startsWith("tg_"),
    ) ||
    ranked[0];

  const passwordHash = await hashPassword(password);

  if (!owner) {
    const created = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        ageConfirmed: true,
        credits: 100000,
        source: "web",
      },
    });
    return NextResponse.json({
      ok: true,
      mode: "created",
      userId: created.id,
      email,
      galleryItems: 0,
      characters: 0,
    });
  }

  // If target email is taken by another row, free it first.
  const clash = await prisma.user.findUnique({ where: { email } });
  if (clash && clash.id !== owner.id) {
    await prisma.user.update({
      where: { id: clash.id },
      data: { email: `moved_${Date.now()}_${clash.email}` },
    });
  }

  const updated = await prisma.user.update({
    where: { id: owner.id },
    data: {
      email,
      passwordHash,
      name: owner.name || name,
      ageConfirmed: true,
    },
  });

  return NextResponse.json({
    ok: true,
    mode: "updated",
    userId: updated.id,
    email,
    oldEmail: owner.email,
    galleryItems: owner._count.galleryItems,
    characters: owner._count.characters,
  });
}
