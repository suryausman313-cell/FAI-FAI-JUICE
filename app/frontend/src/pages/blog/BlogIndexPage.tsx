import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, ChevronRight } from 'lucide-react';
import { blogPosts, getBlogRoute } from '@/lib/blog';

const BlogIndexPage = () => {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-gray-950">
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

      <section className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-5 h-5 text-red-500" />
            <p className="text-sm font-semibold uppercase tracking-wider text-red-500">
              Our Blog
            </p>
          </div>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            Pizza Stories & Local Tips
          </h1>
          <p className="mt-2 text-gray-400">
            Discover the art of authentic Italian pizza, delivery tips, and local food guides for Fujairah.
          </p>
        </div>

        <div className="grid gap-4">
          {blogPosts.length > 0 ? (
            blogPosts.map((post) => (
              <article
                key={post.slug}
                className="rounded-xl border border-gray-800 bg-gray-900 p-5 transition-all duration-200 hover:border-gray-700 hover:bg-gray-900/80"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mb-2">
                  {post.frontmatter.date && <span>{post.frontmatter.date}</span>}
                  {post.frontmatter.tags?.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-red-600/10 border border-red-600/20 px-2 py-0.5 text-red-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <h2 className="text-lg font-bold text-white">
                  <Link className="hover:text-red-400 transition-colors" to={getBlogRoute(post.slug)}>
                    {post.title}
                  </Link>
                </h2>
                <p className="mt-2 text-sm text-gray-400 line-clamp-2">
                  {post.description}
                </p>
                <Link
                  to={getBlogRoute(post.slug)}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-red-500 hover:text-red-400"
                >
                  Read article <ChevronRight className="w-4 h-4" />
                </Link>
              </article>
            ))
          ) : (
            <section className="rounded-xl border border-dashed border-gray-700 bg-gray-900/50 p-8 text-center">
              <h2 className="text-xl font-bold text-white">No articles yet</h2>
              <p className="mt-2 text-gray-400">
                Check back soon for pizza tips and local food guides!
              </p>
            </section>
          )}
        </div>
      </section>
    </main>
  );
};

export default BlogIndexPage;