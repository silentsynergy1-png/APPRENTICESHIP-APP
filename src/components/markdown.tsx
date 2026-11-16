import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/** Safe Markdown rendering (no raw HTML) for AI answers. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        "text-[14.5px] leading-relaxed",
        "[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:font-semibold",
        "[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
        "[&_strong]:font-semibold [&_em]:text-muted-foreground [&_a]:text-primary [&_a]:underline",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[13px] [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-muted [&_pre]:p-3",
        "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[13.5px] [&_th]:border [&_th]:border-border [&_th]:bg-subtle [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}
