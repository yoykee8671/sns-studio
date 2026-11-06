// AI caption drafts: turns everything written on the slides into an Instagram
// caption with the brand voice. Needs ANTHROPIC_API_KEY; SUGGEST_MODEL overrides
// the default (Haiku: cheap, fast).
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { resolveTemplate } from './templates/index.mjs';
import { stripMarkup } from './templates/markup.mjs';

export const suggestReady = () => Boolean(process.env.ANTHROPIC_API_KEY);

const CaptionDraft = z.object({
  detailed: z.string(),
  short: z.string(),
  hashtags: z.array(z.string()).min(5).max(15),
});

/**
 * Drafts an Instagram caption from everything written on the slides.
 * @param {object} o
 * @param {object} o.brand  brand JSON (handle, voice)
 * @param {object} o.post
 * @param {{ title: string, no: number } | null} [o.series]
 * @returns {Promise<{ detailed: string, short: string, hashtags: string[] }>}
 */
export async function suggestCaption({ brand, post, series = null }) {
  const client = new Anthropic();
  const voice = brand.voice ?? {};

  const slideText = post.slides
    .map((slide, i) => {
      const { meta } = resolveTemplate(post, slide);
      const lines = meta.fields
        .map((f) => ({ label: f.label, text: stripMarkup(slide[f.key] ?? '').trim() }))
        .filter((x) => x.text)
        .map((x) => `${x.label}: ${x.text.replace(/\n/g, ' / ')}`);
      return lines.length ? `[${i + 1}장 · ${meta.label}]\n${lines.join('\n')}` : null;
    })
    .filter(Boolean)
    .join('\n\n');
  if (!slideText) throw new Error('슬라이드에 쓴 글이 아직 없어요. 장 내용을 먼저 채워주세요.');

  const system = `당신은 Instagram 피드 콘텐츠 카피라이터입니다. 카드에 쓴 글을 바탕으로 캡션 초안을 씁니다.

계정: ${brand.handle}
페르소나: ${voice.persona ?? '브랜드 공식 계정'}
말투: ${voice.speech ?? '존댓말'} · 유머: ${voice.humor ?? 'light'}

규칙:
- detailed: 6~10줄. 첫 줄은 스크롤을 멈추게 하는 훅, 카드 내용을 요약·보완하고 마지막 줄은 저장·팔로우를 자연스럽게 유도.
- short: 2~3줄. 같은 내용의 압축판.
- 카드에 이미 쓴 문장을 그대로 반복하지 말고 캡션답게 풀어 쓰세요.
- 줄 구분은 \\n, 문단 사이는 빈 줄.
- 상투적인 광고 문구("지금 바로", "놓치지 마세요")와 과장 금지. 이모지는 전체 0~2개.
- hashtags: 한국어 중심 5~15개, # 없이 단어만.`;

  const lines = [`카드에 쓴 글:\n\n${slideText}`];
  if (series) lines.push(`이 게시물은 연재 '${series.title}' ${series.no}호입니다. 연재 느낌을 살려도 좋아요.`);
  if (post.source?.handle) lines.push(`원작자 @${post.source.handle}의 콘텐츠를 소개하는 글입니다. 출처 존중 문구를 포함하세요.`);

  const response = await client.messages.parse({
    model: process.env.SUGGEST_MODEL ?? 'claude-haiku-5-5',
    max_tokens: 2048,
    system,
    messages: [{ role: 'user', content: [{ type: 'text', text: lines.join('\n\n') }] }],
    output_config: { format: zodOutputFormat(CaptionDraft) },
  });
  if (!response.parsed_output) throw new Error('캡션 생성 결과를 읽지 못했어요. 다시 시도해주세요.');
  return response.parsed_output;
}
