import Link from 'next/link';
import { Calendar, User, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AnimatedCard } from '@/components/animated-card';
import type { Post } from '@/lib/db';

interface BlogCardProps {
  post: Post;
  delay?: number;
}

export function BlogCard({ post, delay = 0 }: BlogCardProps) {
  const authorColors = {
    zelda: 'bg-gradient-to-r from-zelda-pink to-zelda-pink-dark text-white',
    blanka: 'bg-gradient-to-r from-blanka-teal to-blanka-teal-dark text-white',
  };

  const formattedDate = new Date(post.createdAt).toLocaleDateString('sv-SE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <AnimatedCard delay={delay}>
      <Card className="group h-full overflow-hidden rounded-3xl border-2 transition-all hover:shadow-2xl hover:-translate-y-2">
        {post.imageUrl && (
          <div className="relative aspect-video w-full overflow-hidden bg-muted">
            <img
              src={post.imageUrl || "/placeholder.svg"}
              alt={post.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        )}
        
        <CardHeader className="space-y-4 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`${authorColors[post.author]} border-0 px-3 py-1 font-bold shadow-md`}>
              <User className="mr-1.5 h-3.5 w-3.5" />
              {post.author === 'zelda' ? 'Zelda' : 'Blanka'}
            </Badge>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground font-medium">
              <Calendar className="h-3.5 w-3.5" />
              {formattedDate}
            </span>
          </div>
          
          <h3 className="text-balance font-bold text-2xl leading-tight text-foreground transition-colors group-hover:text-primary">
            {post.title}
          </h3>
        </CardHeader>

        <CardContent className="pb-4">
          <p className="text-pretty text-muted-foreground line-clamp-3 leading-relaxed">
            {post.excerpt}
          </p>
          
          {post.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="rounded-full px-3 py-1 text-xs font-medium">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>

        <CardFooter className="pt-2">
          <Button asChild variant="ghost" className="group/button w-full rounded-xl font-bold text-base">
            <Link href={`/${post.author}/${post.slug}`}>
              Läs mer
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover/button:translate-x-2" />
            </Link>
          </Button>
      </CardFooter>
      </Card>
    </AnimatedCard>
  );
}
