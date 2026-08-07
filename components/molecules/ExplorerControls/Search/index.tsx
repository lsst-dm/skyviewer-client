/* eslint-disable react/jsx-key, jsx-a11y/anchor-has-content */
import { FC, FormEventHandler, useId, useRef, useState } from "react";
import Link from "next/link";
import { Trans, useTranslation } from "react-i18next";
import { CloseButton, Dialog, DialogPanel } from "@headlessui/react";
import {
  AnimatePresence,
  motion,
  TargetAndTransition,
  Transition,
} from "motion/react";
import { IoSearchOutline, IoClose } from "react-icons/io5";
import Skeleton from "react-loading-skeleton";

import clsx from "clsx/lite";
import CoordinateHelp from "./CoordinateHelp";
import { useRouter } from "@/lib/i18n/navigation";
import { viewAsParams } from "@/lib/aladin/helpers";
import {
  parseCoordinates,
  toDecimal,
  toSexagesimal,
} from "@/lib/astro/coordinates";
import useAladinMove from "@/hooks/useAladinMove";
import { useAladin } from "@/contexts/Aladin";
import IconButton from "@/components/atomic/IconButton";
import styles from "./styles.module.css";

interface FoundTarget {
  name?: string;
  ra: number;
  dec: number;
}

interface SearchProps {
  buttonClassName?: string;
  className?: string;
}

const Search: FC<SearchProps> = ({ buttonClassName, className }) => {
  const aladinContext = useAladin();
  const { A } = aladinContext;
  const {
    t,
    i18n: { language },
  } = useTranslation();
  const id = useId();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [isOpen, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<FoundTarget | null>(null);
  const [input, setInput] = useState<string>("");
  const { format } = new Intl.NumberFormat(language, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 5,
    unit: "degree",
  });
  const panAndGo = useAladinMove();
  const targetFov = 0.6;

  const clearSearch = () => {
    setInput("\u200b");
    setError(null);
    setFound(null);
  };

  const closeSearchBar = () => {
    clearSearch();

    setPending(false);
    setOpen(false);
  };

  const openSearchBar = () => {
    setOpen(true);
  };

  const toggleSearchBar = () => {
    if (isOpen) {
      closeSearchBar();
    } else {
      openSearchBar();

      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          // this is necessary for a headlessui bug that does not remove the portal
          // if no input has been put into the search area
          setInput("\u200b");
        }
      });
    }
  };

  const showError = (error: string) => {
    setFound(null);
    setPending(false);
    setError(error);
  };

  const goToPosition = (
    { name, ...position }: FoundTarget,
    fov: number = targetFov
  ) => {
    setFound({ ...position, name });
    setPending(false);
    panAndGo({
      ...position,
      fov,
      onComplete: () => {
        router.push(
          `?${viewAsParams({
            target: [position.ra, position.dec],
            fov,
          }).toString()}`
        );
      },
    });
  };

  const resolveSearch = (search: string) => {
    const coordinates = parseCoordinates(search);

    // A position is tried first and taken at its word — an object name
    // never parses as one, so nothing is stolen from the resolver, while
    // sexagesimal used to be routed to it on the strength of its h/m/s and
    // come back as "not found". The view only recentres: someone who typed
    // coordinates has a scale in mind, and pulling them to a fixed zoom
    // would throw away the one they were working at.
    if (coordinates) {
      goToPosition(
        coordinates,
        aladinContext.isLoading ? targetFov : aladinContext.aladin.getFov()[0]
      );

      return;
    }

    if (/[a-zA-Z]/.test(search)) {
      A?.Utils.Sesame.resolveAstronomicalName(
        search,
        (position) => {
          if (Number.isNaN(position.ra) || Number.isNaN(position.dec)) {
            showError(t("menu.search.error", { context: "object", search }));
          } else {
            goToPosition({ ...position, name: search });
          }
        },
        () => {
          showError(t("menu.search.error", { context: "object", search }));
        }
      );

      return;
    }

    showError(t("menu.search.error", { context: "coordinate" }));
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    setError(null);
    setPending(true);

    if (input && typeof input === "string") {
      resolveSearch(input);
    }
  };

  const animations: Record<
    string,
    {
      initial: TargetAndTransition;
      animate: TargetAndTransition;
      exit: TargetAndTransition;
      transition: Transition;
    }
  > = {
    dialog: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.4, ease: "easeInOut", type: "tween" },
    },
    controls: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.2, ease: "easeInOut" },
    },
  };

  const isEditing = input?.length > 0;

  return (
    <>
      <IconButton
        styleAs="none"
        text={t("menu.search.open")}
        onClick={toggleSearchBar}
        icon={<IoSearchOutline />}
        className={clsx(styles.toggleButton, buttonClassName)}
      />
      <AnimatePresence>
        {isOpen && (
          <Dialog
            static
            open={isOpen}
            className={clsx(styles.dialog, className)}
            onClose={() => closeSearchBar()}
          >
            <DialogPanel className={styles.panel}>
              <motion.div className={styles.backdrop} {...animations.dialog} />
              <div className={styles.formWrapper}>
                <motion.form
                  className={styles.form}
                  initial={{ width: "var(--size-spacing-l)" }}
                  animate={{ width: "100%" }}
                  exit={{ width: "var(--size-spacing-l)" }}
                  transition={animations.dialog.transition}
                  onSubmit={handleSubmit}
                >
                  <button
                    type="submit"
                    title={t("menu.search.submit")}
                    className={styles.searchIcon}
                  >
                    <IoSearchOutline />
                  </button>
                  <input
                    className={styles.searchInput}
                    name="search"
                    type="search"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={pending}
                    required
                    placeholder={t("menu.search.placeholder")}
                    autoComplete="off"
                    aria-describedby={id}
                    ref={inputRef}
                  />
                  <AnimatePresence propagate>
                    {isEditing && (
                      <motion.button
                        type="button"
                        title={t("menu.search.clear")}
                        className={styles.closeButton}
                        onClick={clearSearch}
                        {...animations.controls}
                      >
                        <IoClose />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </motion.form>
                <CloseButton
                  as={motion.button}
                  className={styles.cancelButton}
                  initial={{ x: 15, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 15, opacity: 0 }}
                  transition={animations.dialog.transition}
                  key={t("navigation.cta.cancel")}
                >
                  {t("navigation.cta.cancel")}
                </CloseButton>
              </div>

              <motion.div className={styles.info} {...animations.dialog}>
                <hr className={styles.hr} />
                <output>
                  {pending ? (
                    <div>
                      <Skeleton />
                      <Skeleton width="50%" />
                    </div>
                  ) : (
                    <>
                      {error}
                      {found && (
                        <Trans
                          i18nKey="menu.search.found"
                          values={{
                            name: found.name,
                            position: `${format(found.ra)}° ${format(
                              found.dec
                            )}°`,
                          }}
                          components={[
                            <span className={styles.noWrap} />,
                            <Link
                              className={styles.noWrap}
                              href={{
                                query: viewAsParams({
                                  target: [found.ra, found.dec],
                                  fov: targetFov,
                                }).toString(),
                              }}
                            />,
                          ]}
                          context={found.name ? "object" : "position"}
                        ></Trans>
                      )}
                      {found && (
                        // the position as it was understood, in both
                        // notations. Whatever went into the box, this is
                        // where the viewer actually went, and either line
                        // can be pasted straight back in
                        <dl className={styles.reading}>
                          <div className={styles.readingRow}>
                            <dt className={styles.readingLabel}>
                              {t("menu.search.reading.decimal")}
                            </dt>
                            <dd className={styles.readingValue}>
                              <code>{toDecimal(found).ra}</code>{" "}
                              <code>{toDecimal(found).dec}</code>
                            </dd>
                          </div>
                          <div className={styles.readingRow}>
                            <dt className={styles.readingLabel}>
                              {t("menu.search.reading.sexagesimal")}
                            </dt>
                            <dd className={styles.readingValue}>
                              <code>{toSexagesimal(found).ra}</code>{" "}
                              <code>{toSexagesimal(found).dec}</code>
                            </dd>
                          </div>
                        </dl>
                      )}
                    </>
                  )}
                </output>
                <div className={styles.helpText}>
                  <Trans i18nKey="menu.search.take_a_tour">
                    Don&apos;t know what to look for?
                    <Link href="/tours">Take a tour</Link>
                  </Trans>
                </div>

                <div className={styles.helpText}>
                  <Trans i18nKey="menu.search.quick_links.list_header">
                    Go straight to:
                  </Trans>
                  <ul>
                    <li>
                      <Trans
                        i18nKey="menu.search.quick_links.item_1"
                        components={[
                          <a
                            href="/explorer?target=224.76873+-39.61698&fov=3.60"
                            hrefLang="en"
                          />,
                        ]}
                      >
                        <a href="/explorer?target=224.76873+-39.61698&fov=3.60">
                          Ocean of Stars
                        </a>
                      </Trans>
                    </li>
                    <li>
                      <Trans
                        i18nKey="menu.search.quick_links.item_2"
                        components={[
                          <a
                            href="/explorer?target=187.77035+8.07268&fov=2.00"
                            hrefLang="en"
                          />,
                        ]}
                      >
                        <a href="/explorer?target=187.77035+8.07268&fov=2.00">
                          Cosmic Treasure Chest (the Virgo Cluster)
                        </a>
                      </Trans>
                    </li>
                    <ul>
                      <li>
                        <Trans
                          i18nKey="menu.search.quick_links.treasure_chest_chart"
                          components={[
                            <a
                              href="https://rubinobservatory.org/gallery/collections/first-look-gallery/qe2do9iu6h1gbdg4bsgc1o083u"
                              hrefLang="en"
                              target="_blank"
                              rel="noreferrer"
                            />,
                          ]}
                        >
                          Looking for something specific in the Cosmic Treasure
                          Chest?
                          <a
                            href="https://rubinobservatory.org/gallery/collections/first-look-gallery/qe2do9iu6h1gbdg4bsgc1o083u"
                            target="_blank"
                            rel="noreferrer"
                          />
                          Check our finder chart.
                        </Trans>
                      </li>
                    </ul>
                  </ul>
                </div>

                <div id={id} className={styles.helpText}>
                  <Trans
                    i18nKey="menu.search.instructions"
                    components={[
                      <a
                        href="https://simbad.cds.unistra.fr/simbad/"
                        hrefLang="en"
                        target="_blank"
                        rel="noreferrer"
                      />,
                      <a
                        href="https://ned.ipac.caltech.edu/"
                        hrefLang="en"
                        target="_blank"
                        rel="noreferrer"
                      />,
                    ]}
                  >
                    Skyviewer searches common names of astronomical objects,
                    e.g. “M49” or “Messier 49,” using the
                    <a
                      href="https://simbad.cds.unistra.fr/simbad/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      SIMBAD
                    </a>
                    and
                    <a
                      href="https://ned.ipac.caltech.edu/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      NED
                    </a>
                    astronomical databases. Skyviewer can also search on
                    coordinate locations of objects using right ascension (RA)
                    and declination (DEC) in decimal format, e.g. “186.2 7.0.”
                  </Trans>
                </div>

                <CoordinateHelp />
              </motion.div>
            </DialogPanel>
          </Dialog>
        )}
      </AnimatePresence>
    </>
  );
};

export default Search;
