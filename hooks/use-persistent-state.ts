import { useState, useEffect } from "react";

// Custom hook for persistent state
export function usePersistentState<T>(key: string, initialValue: T | (() => T), reviver?: (this: any, key: string, value: any) => any): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [state, setState] = useState<T>(initialValue as T);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        try {
            const item = window.localStorage.getItem(key);
            if (item) {
                setState(JSON.parse(item, reviver));
            }
        } catch (error) {
            console.error(error);
        }
        setLoaded(true);
    }, [key]);

    useEffect(() => {
        if (loaded) {
            try {
                window.localStorage.setItem(key, JSON.stringify(state));
            } catch (error) {
                console.error(error);
            }
        }
    }, [key, state, loaded]);

    return [state, setState];
}
