import Markdown from 'markdown-to-jsx';

type MarkdownArticleProps = {
  markdown: string;
};

const MarkdownArticle = ({ markdown }: MarkdownArticleProps) => (
  <div className="prose prose-invert prose-lg max-w-none prose-headings:text-white prose-h1:mt-0 prose-h1:text-3xl prose-h2:mt-10 prose-h2:border-t prose-h2:border-gray-800 prose-h2:pt-6 prose-h2:text-2xl prose-h3:mt-8 prose-h3:text-xl prose-p:text-gray-300 prose-p:leading-8 prose-li:text-gray-300 prose-li:leading-8 prose-strong:text-white prose-code:rounded prose-code:bg-gray-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.9em] prose-code:font-medium prose-code:text-red-400 prose-pre:rounded-xl prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-800 prose-pre:p-5 prose-a:text-red-400 prose-a:decoration-red-600/30 prose-a:underline-offset-4 hover:prose-a:text-red-300 prose-blockquote:border-red-600/50 prose-blockquote:text-gray-400">
    <Markdown
      options={{
        forceBlock: true,
        overrides: {
          a: {
            props: {
              className: 'font-medium',
            },
          },
          code: {
            props: {
              className: '',
            },
          },
          pre: {
            props: {
              className: 'overflow-x-auto',
            },
          },
        },
      }}
    >
      {markdown}
    </Markdown>
  </div>
);

export default MarkdownArticle;