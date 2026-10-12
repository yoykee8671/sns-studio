import './globals.css';

export const metadata = {
  title: 'SNS Studio',
  description: '브랜드 계정별 피드 제작 · QA · 발행',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
