# app/page.tsx

Reason: Useful structural reference

```text
"use client"

import { MotherDuckClientProvider, useMotherDuckClientState } from "@/lib/motherduck/context/motherduckClientContext";
import HintComponent from "./components/hint";
import { useCallback, useState, useEffect } from "react";

const SQL_QUERY_STRING = `SELECT
    u.username,
    u.email,
    o.total_amount,
    o.order_date::VARCHAR as order_date
FROM
    my_db.main.orders o
JOIN
    my_db.main.users u ON o.user_id = u.user_id;`;

const useFetchCustomerOrdersData = () => {
    const { safeEvaluateQuery } = useMotherDuckClientState();
    const [error, setError] = useState<string | null>(null);

    const fetchCustomerOrdersData = useCallback(async () => {
        try {
            const safeResult = await safeEvaluateQuery(SQL_QUERY_STRING);
            if (safeResult.status === "success") {
                setError(null);
                return safeResult.result.data.toRows().map((row) => {
                    return {
                        username: row.username?.valueOf() as string,
                        email: row.email?.valueOf() as string,
                        totalAmount: row.total_amount?.valueOf() as number,
                        orderDate: row.order_date?.valueOf() as string,
                    };
                });

            } else {
                setError(safeResult.err.message);
                return [];
            }
        } catch (error) {
            setError("fetchCustomerOrdersData failed with error: " + error);
            return [];
        }

    }, [safeEvaluateQuery]);

    return { fetchCustomerOrdersData, error };
}


function CustomerOrdersTable() {
    const { fetchCustomerOrdersData, error } = useFetchCustomerOrdersData();
    const [customerOrdersData, setCustomerOrdersData] = useState<{ username: string, email: string, totalAmount: number, orderDate: string }[]>([]);
    const [loading, setLoading] = useState(false);

    const handleFetchCustomerOrdersData = async () => {
        setLoading(true);
        const result = await fetchCustomerOrdersData();
        setCustomerOrdersData(result);
        setLoading(false);
    };

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            const result = await fetchCustomerOrdersData();
            setCustomerOrdersData(result);
            se

// ... truncated
```
