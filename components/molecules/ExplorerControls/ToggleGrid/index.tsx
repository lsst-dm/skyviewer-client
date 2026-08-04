"use client";
import { FC, useEffect, useState } from "react";
import IconToggle from "@/components/atomic/IconToggle";
import IconComposer from "@/components/svg/IconComposer";
import { useAladin } from "@/contexts/Aladin";
import useSkyCurvature from "@/hooks/useSkyCurvature";

const ToggleGrid: FC = () => {
  const { aladin, isLoading } = useAladin();
  const isCurved = useSkyCurvature();
  const [gridEnabled, setGridEnabled] = useState<boolean>(
    !!aladin?.view.gridCfg.enabled
  );
  // The grid is only worth showing unasked while the sky is visibly curved,
  // where it is what makes the curvature legible. Once the user has expressed
  // an opinion by working the toggle, that opinion holds for the rest of the
  // session: nothing is more irritating than a control that undoes itself.
  const [isUserChoice, setUserChoice] = useState(false);

  const setGrid = (enabled: boolean) => {
    if (aladin) {
      aladin.setCooGrid({ enabled });
      setGridEnabled(enabled);
    }
  };

  const handleGridToggle = (checked: boolean) => {
    setUserChoice(true);
    setGrid(checked);
  };

  useEffect(() => {
    if (!isLoading && !isUserChoice && isCurved !== gridEnabled) {
      setGrid(isCurved);
    }
    // setGrid closes over this render's aladin and is stable enough for that
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isUserChoice, isCurved, gridEnabled]);

  return (
    <IconToggle
      disabled={isLoading}
      icon={<IconComposer icon="Grid" />}
      isChecked={gridEnabled}
      onToggleCallback={handleGridToggle}
    />
  );
};

ToggleGrid.displayName = "Molecule.ExplorerControl.ToggleGrid";

export default ToggleGrid;
