"use client";
import { Description, Field, Label } from "@headlessui/react";
import { MenuGroup } from "@rubin-epo/epo-react-lib/SlideoutMenu";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import { useLocalStorage } from "usehooks-ts";
import { SKYMAP_SOURCES, SKYMAP_STORAGE_KEY } from "@/lib/skymap/catalogue";
import Switch from "@/components/atomic/Switch";
import styles from "./styles.module.css";

/**
 * Picks a tract grid to draw over the imagery.
 *
 * One at a time, and none by default. The list is skymaps we happen to have
 * dumped, not skymaps the surveys were built on — the HiPS record no such
 * thing — so these are offered to be compared against the imagery rather
 * than presented as the answer.
 */
const Skymap: FC = () => {
  const { t } = useTranslation();
  const [selected, setSelected] = useLocalStorage<string | null>(
    SKYMAP_STORAGE_KEY,
    null
  );

  return (
    <MenuGroup title={t("menu.display.skymap.title")}>
      <p className={styles.caption}>{t("menu.display.skymap.caption")}</p>
      <ol className={styles.list}>
        {SKYMAP_SOURCES.map(({ id, label }) => (
          <Field as="li" className={styles.item} key={id}>
            <div>
              <Label className={styles.label}>{label}</Label>
              <Description className={styles.description}>
                {t("menu.display.skymap.tracts")}
              </Description>
            </div>
            <Switch
              checked={selected === id}
              onChange={(checked) => setSelected(checked ? id : null)}
            />
          </Field>
        ))}
      </ol>
    </MenuGroup>
  );
};

Skymap.displayName = "Organism.Menu.Display.Skymap";

export default Skymap;
