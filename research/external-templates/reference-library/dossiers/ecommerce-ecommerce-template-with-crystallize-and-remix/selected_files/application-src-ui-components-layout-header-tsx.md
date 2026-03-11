# application/src/ui/components/layout/header.tsx

Reason: Layout and navigation reference

```text
'use client';
import UserIcon from '~/assets/userIcon.svg';
import Link from '~/bridge/ui/Link';
import { SearchBar } from '../search/search-bar';
import { BasketButton } from './basket-button';
import { TopicNavigation } from './topic-navigation';
import { useEffect, useState } from 'react';
import { useAppContext } from '../../app-context/provider';
import { Image } from '@crystallize/reactjs-components';
import { Price } from '../price';
import { LanguageSwitcher } from './language-switcher';
import { Tree } from '../../../use-cases/contracts/Tree';
import { TenantLogo } from '../../lib/tenant-logo';
import useLocation from '~/bridge/ui/useLocation';

export const Header: React.FC<{
    navigation: {
        folders: Tree[];
        topics: Tree[];
    };
}> = ({ navigation }) => {
    const { state: appContextState, dispatch: appContextDispatch, path } = useAppContext();
    let checkoutFlow = ['/cart', '/checkout', '/confirmation'];
    let [isOpen, setIsOpen] = useState(false);
    let location = useLocation();
    let paths = [
        { path: '/cart', name: 'Cart' },
        { path: '/checkout', name: 'Checkout' },
        { path: '/confirmation', name: 'Confirmation' },
    ];

    useEffect(() => {
        setIsOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (appContextState.latestAddedCartItems.length === 0) {
            return;
        }
        let timeout: ReturnType<typeof setTimeout>;
        setTimeout(() => {
            appContextDispatch.resetLastAddedItems();
        }, 3000);
        return () => clearTimeout(timeout);
    }, [appContextState.latestAddedCartItems]);

    return (
        <header className="2xl w-full mx-auto lg:p-8 lg:px-6">
            {appContextState.latestAddedCartItems.length > 0 && (
                <div className="border-[#dfdfdf] border rounded-md shadow fixed max-w-full sm:top-2 sm:right-2 bg-[#fff]  z-[60]  p-6">
                    <p className="font-bold text-md mb-3 pb-2">Added product(s) to cart</p>
                    {appContextState.latestAddedCartItems.map((item, index) => {
                        return (
                            <div className="flex p-3 mt-1 items-center bg-grey2 gap-3" key={index}>
                                <div className="max-w-[35px] max-h-[50px] img-container img-contain">

// ... truncated
```
