"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const RULES = {
  ru: {
    title: "PeachBitch — правила",
    sections: [
      {
        h: "Возраст",
        p: "Сервис только для лиц 18+. Используя PeachBitch, ты подтверждаешь свой возраст.",
      },
      {
        h: "Контент и согласие",
        p: "Загружай только свои фото или фото с явного согласия модели. Запрещены deepfake и изображения реальных людей без их разрешения.",
      },
      {
        h: "Законность",
        p: "Не используй сервис для незаконного контента. Ты несёшь ответственность за загружаемые материалы.",
      },
      {
        h: "AI-генерация",
        p: "Результаты могут быть неточными. Используй перегенерацию при необходимости.",
      },
      {
        h: "Изменения",
        p: "Правила могут обновляться. Продолжая пользоваться сервисом, ты принимаешь актуальную версию.",
      },
    ],
  },
  en: {
    title: "PeachBitch — Terms & Rules",
    sections: [
      {
        h: "Age",
        p: "This service is 18+ only. By using PeachBitch you confirm you meet the age requirement.",
      },
      {
        h: "Content & consent",
        p: "Upload only your photos or photos with explicit model consent. Non-consensual deepfakes of real people are prohibited.",
      },
      {
        h: "Legality",
        p: "Do not use the service for illegal content. You are responsible for materials you upload.",
      },
      {
        h: "AI output",
        p: "Generated content may be imperfect. Use reroll when needed.",
      },
      {
        h: "Updates",
        p: "Rules may change. Continued use means acceptance of the current version.",
      },
    ],
  },
} as const;

function RulesBody() {
  const params = useSearchParams();
  const lang = params.get("lang") === "en" ? "en" : "ru";
  const doc = RULES[lang];

  return (
    <main className="rules-page">
      <h1>{doc.title}</h1>
      {doc.sections.map((s) => (
        <section key={s.h}>
          <h2>{s.h}</h2>
          <p>{s.p}</p>
        </section>
      ))}
      <style jsx>{`
        .rules-page {
          max-width: 42rem;
          margin: 0 auto;
          padding: 2rem 1.25rem 3rem;
          font-family: Georgia, "Times New Roman", serif;
          line-height: 1.65;
          color: #1a1a1a;
          background: #fafafa;
          min-height: 100dvh;
        }
        h1 {
          font-size: 1.75rem;
          margin: 0 0 1.5rem;
        }
        h2 {
          font-size: 1.1rem;
          margin: 1.25rem 0 0.35rem;
        }
        p {
          margin: 0;
          color: #333;
        }
      `}</style>
    </main>
  );
}

export default function TgRulesPage() {
  return (
    <Suspense fallback={<main style={{ padding: "2rem" }}>…</main>}>
      <RulesBody />
    </Suspense>
  );
}
