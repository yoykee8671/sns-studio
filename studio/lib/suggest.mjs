// AI copy suggestions: sends the slide's photo (or a video's first frame) to
// Claude with the brand voice and returns three headline/comment drafts.
// Needs ANTHROPIC_API_KEY; SUGGEST_MODEL overrides the default (Haiku: cheap, fast).
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const Candidates = z.object({
  candidates: z
    .array(z.object({ headline: z.string(), body: z.string() }))
    .min(3)
    .max(3),
});

export const suggestReady = () => Boolean(process.env.ANTHROPIC_API_KEY);

/**
 * @param {object} o
 * @param {object} o.brand  brand JSON (handle, voice)
 * @param {object} o.post
 * @param {object} o.slide
 * @param {string|null} o.imageBase64  JPEG of the slide media, if any
 * @param {string[]} o.avoid  phrasings the new drafts should differ from
 * @returns {Promise<{headline: string, body: string}[]>}
 */
export async function suggestCopy({ brand, post, slide, imageBase64, avoid = [] }) {
  const client = new Anthropic();
  const isKnowledge = post.contentType === 'knowledge';
  const bodyLines = !isKnowledge && slide.layout === 'overlay' ? 4 : 2;
  const voice = brand.voice ?? {};

  const system = `당신은 Instagram 피드 콘텐츠 카피라이터입니다. 계정에 맞는 한국어 문구를 씁니다.

계정: ${brand.handle}
페르소나: ${voice.persona ?? '브랜드 공식 계정'}
말투: ${voice.speech ?? '존댓말'} · 유머: ${voice.humor ?? 'light'}
콘텐츠 종류: ${isKnowledge ? '지식형 — 사진과 함께 유용한 정보를 전하는 게시물. 코멘트는 정보 전달 중심.' : '디깅형 — 다른 크리에이터의 콘텐츠를 소개하는 큐레이션. 코멘트는 큐레이터의 감상과 추천 포인트.'}

규칙:
- headline: 1~2줄, 줄당 20자 이내. 스크롤을 멈추게 하는 한 문장.
- body: 최대 ${bodyLines}줄, 줄당 28자 내외. 줄 구분은 \\n으로.
- 상투적인 광고 문구("지금 바로", "~해보세요", "놓치지 마세요")와 과장은 피합니다.
- 이모지는 전체에서 0~1개만.
- 세 후보는 서로 결(톤·구조·관점)이 달라야 합니다.`;

  const content = [];
  if (imageBase64) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
    });
  }
  const lines = [
    imageBase64
      ? `이 ${slide.mediaType === 'video' || post.format === 'reel' ? '영상의 한 장면' : '사진'}에 어울리는 헤드라인과 코멘트 후보 3개를 만들어주세요.`
      : '아직 미디어가 없는 장입니다. 아래 맥락만으로 후보 3개를 만들어주세요.',
  ];
  if (post.source?.handle) lines.push(`원작자 @${post.source.handle}의 콘텐츠를 소개하는 글입니다.`);
  if (post.caption) lines.push(`게시물 캡션 (참고): ${post.caption.slice(0, 400)}`);
  if (avoid.length) lines.push(`다음 문구들과는 다른 결로 써주세요:\n${avoid.map((t) => `- ${t.replace(/\n/g, ' / ')}`).join('\n')}`);
  content.push({ type: 'text', text: lines.join('\n') });

  const response = await client.messages.parse({
    model: process.env.SUGGEST_MODEL ?? 'claude-haiku-5-5',
    max_tokens: 2048,
    system,
    messages: [{ role: 'user', content }],
    output_config: { format: zodOutputFormat(Candidates) },
  });
  if (!response.parsed_output) throw new Error('문구 생성 결과를 읽지 못했어요. 다시 시도해주세요.');
  return response.parsed_output.candidates;
}
