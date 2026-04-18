import { useReducer, useCallback } from "react";
import { blankTab, tabsReducer } from "../lib/tabs";

function init() {
  const fresh = blankTab();
  return { tabs: [fresh], activeId: fresh.id };
}

export function useTabs() {
  const [state, dispatch] = useReducer(tabsReducer, undefined, init);

  const addTab = useCallback(() => dispatch({ type: "ADD" }), []);
  const closeTab = useCallback((id) => dispatch({ type: "CLOSE", id }), []);
  const clearAll = useCallback(() => dispatch({ type: "CLEAR" }), []);
  const setActive = useCallback((id) => dispatch({ type: "SET_ACTIVE", id }), []);
  const updateMeta = useCallback(
    (id, meta) => dispatch({ type: "UPDATE_META", id, meta }),
    [],
  );

  return { ...state, addTab, closeTab, clearAll, setActive, updateMeta };
}
