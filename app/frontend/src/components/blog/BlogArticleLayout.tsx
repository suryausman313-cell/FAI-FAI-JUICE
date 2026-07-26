import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

type BlogArticleLayoutProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

const BlogArticleLayout = ({
  title,
  description,
  children,
}: BlogArticleLayoutProps) => {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-gray-950 text-gray-200">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white cursor-pointer">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="text-white font-black text-lg">Vita</span>{' '}
            <span className="text-red-600 font-black text-lg">Napoli</span>
          </div>
          <span className="text-gray-500 text-sm ml-2">Blog</span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pt-6">
        <Link
          to="/blog/"
          className="text-sm text-gray-500 hover:text-red-400 transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" /> Back to blog
        </Link>
      </div>
      <article className="mx-auto max-w-3xl px-4 py-8">
        <header className="border-b border-gray-800 pb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-red-500">
            Blog Article
          </p>
          <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl leading-tight">
            {title}
          </h1>
          {description ? (
            <p className="mt-4 text-base text-gray-400 leading-relaxed">
              {description}
            </p>
          ) : null}
        </header>

        <div className="mt-8">{children}</div>
      </article>
    </main>
  );
};

export default BlogArticleLayout;