'use client';

import React from "react"

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { PenSquare, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Author } from '@/lib/db';

interface AdminPanelProps {
  author: Author;
}

export function AdminPanel({ author }: AdminPanelProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [tags, setTags] = useState('');
  const [published, setPublished] = useState(true);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        setIsAuthenticated(true);
        setPassword('');
      } else {
        setError('Felaktigt lösenord');
      }
    } catch (err) {
      setError('Något gick fel');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const slug = title
        .toLowerCase()
        .replace(/å/g, 'a')
        .replace(/ä/g, 'a')
        .replace(/ö/g, 'o')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const excerpt = content.replace(/^#+\s/gm, '').split('\n').find(line => line.trim().length > 0)?.slice(0, 150) || '';

      const postData = {
        slug,
        title,
        content,
        excerpt,
        author,
        imageUrl: imageUrl || undefined,
        tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
        published,
      };

      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postData),
      });

      if (response.ok) {
        // Reset form
        setTitle('');
        setContent('');
        setImageUrl('');
        setTags('');
        setPublished(true);
        setIsOpen(false);
        router.refresh();
      } else {
        setError('Kunde inte skapa inlägg');
      }
    } catch (err) {
      setError('Något gick fel');
    } finally {
      setLoading(false);
    }
  };

  const authorColors = {
    zelda: 'from-zelda-pink to-zelda-pink-dark',
    blanka: 'from-blanka-teal to-blanka-teal-dark',
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          className={`fixed bottom-6 right-6 z-50 h-16 w-16 rounded-full bg-gradient-to-br ${authorColors[author]} shadow-2xl text-white hover:scale-110 hover:-translate-y-1 transition-all sm:h-auto sm:w-auto sm:rounded-2xl sm:px-8 sm:py-4 font-bold`}
        >
          <PenSquare className="h-6 w-6 sm:mr-2" />
          <span className="hidden sm:inline">Skriv inlägg</span>
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Skriv nytt inlägg
            <Badge className={`bg-gradient-to-r ${authorColors[author]} text-white border-0 shadow-md`}>
              {author === 'zelda' ? 'Zelda' : 'Blanka'}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Skapa ett nytt blogginlägg för {author === 'zelda' ? 'Zelda' : 'Blanka'}
          </DialogDescription>
        </DialogHeader>

        {!isAuthenticated ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">
                <Lock className="mb-1 mr-2 inline h-4 w-4" />
                Lösenord
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ange admin-lösenord"
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Loggar in...' : 'Logga in'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titel *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="T.ex. Min roliga dag"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Innehåll (Markdown) *</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="# Min rubrik&#10;&#10;Här skriver du ditt inlägg..."
                rows={10}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="imageUrl">Bild-URL (valfritt)</Label>
              <Input
                id="imageUrl"
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Taggar (kommaseparerade)</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="pyssel, kul, vänner"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="published"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="published" className="cursor-pointer">
                Publicera direkt
              </Label>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Skapar...' : 'Skapa inlägg'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
