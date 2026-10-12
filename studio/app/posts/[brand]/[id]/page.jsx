import Editor from './editor';

export default async function PostPage({ params }) {
  const { brand, id } = await params;
  return <Editor brandId={brand} postId={id} />;
}
