# src/components/header.tsx

Reason: Useful structural reference

```text
import React from 'react';
import { cn } from '@/lib/utils';

const Header: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => {
  return (
    <header
      className={cn(
        'sticky top-0 z-1 flex items-center justify-between xs:min-h-auto md:min-h-16 border-b px-3 bg-defaultBase/60 backdrop-blur',
        className
      )}
      {...props}
    />
  );
};

export default Header;
```
