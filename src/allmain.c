/* NetHack 5.0	allmain.c	$NHDT-Date: 1781973040 2026/06/20 16:30:40 $  $NHDT-Branch: NetHack-5.0 $:$NHDT-Revision: 1.304 $ */
/* Copyright (c) Stichting Mathematisch Centrum, Amsterdam, 1985. */
/*-Copyright (c) Robert Patrick Rankin, 2012. */
/* NetHack may be freely redistributed.  See license for details. */

/* various code that was replicated in *main.c */

#include "hack.h"

#ifndef NO_SIGNAL
#include <signal.h>
#endif

staticfn void moveloop_preamble(boolean);
staticfn void u_calc_moveamt(int);
staticfn void maybe_generate_rnd_mon(void);
staticfn void maybe_do_tutorial(void);
staticfn void maybe_setup_electron_pickup_test_pile(void);
staticfn void maybe_setup_electron_json_test_scenario(void);
#ifdef NH_ELECTRON_TEST_FIXTURES
staticfn void electron_test_fixture_event(const char *, const char *, const char *,
                                          const char *);
staticfn void electron_test_fixture_fail(const char *, const char *);
staticfn void electron_test_require_runtime_gate(const char *);
struct electron_test_scenario_v1;
struct electron_test_object_spec;
struct electron_test_expected_list;
struct electron_test_location_spec;
staticfn void electron_test_validate_resolved_path(const char *, const char *);
staticfn char *electron_test_read_file(const char *);
staticfn const char *electron_json_ws(const char *);
staticfn void electron_json_fail(const char *, const char *);
staticfn void electron_json_expect_char(const char **, int, const char *, const char *);
staticfn boolean electron_json_consume_char(const char **, int);
staticfn int electron_hex_value(int);
staticfn char *electron_json_parse_string(const char **, const char *);
staticfn long electron_json_parse_int(const char **, const char *);
staticfn boolean electron_json_parse_bool(const char **, const char *);
staticfn boolean electron_json_peek_char(const char **, int);
staticfn void electron_json_require_unique(unsigned *, unsigned, const char *, const char *);
staticfn void electron_json_expect_string_value(const char **, const char *, const char *, const char *);
staticfn int electron_test_type_id_from_string(const char *);
staticfn int electron_test_monster_id_from_string(const char *);
staticfn int electron_test_terrain_type_from_string(const char *, int *, int *);
staticfn int electron_test_trap_type_from_string(const char *);
staticfn boolean electron_test_is_container_type(int);
staticfn boolean electron_test_is_equippable_worn_type(int);
staticfn void electron_test_copy_fact(char *, const char *, const char *);
staticfn int electron_test_alloc_object(struct electron_test_scenario_v1 *);
staticfn int electron_test_parse_object_spec(const char **,
                                             struct electron_test_scenario_v1 *,
                                             boolean, boolean, boolean);
staticfn void electron_test_parse_contents(const char **,
                                           struct electron_test_scenario_v1 *,
                                           struct electron_test_object_spec *);
staticfn void electron_test_parse_location(const char **,
                                           struct electron_test_scenario_v1 *,
                                           struct electron_test_location_spec *);
staticfn void electron_test_parse_ground_entry(const char **,
                                               struct electron_test_scenario_v1 *);
staticfn void electron_test_parse_ground(const char **,
                                         struct electron_test_scenario_v1 *);
staticfn void electron_test_parse_inventory(const char **,
                                            struct electron_test_scenario_v1 *);
staticfn void electron_test_parse_hero(const char **,
                                       struct electron_test_scenario_v1 *);
staticfn void electron_test_parse_level(const char **,
                                        struct electron_test_scenario_v1 *);
staticfn void electron_test_parse_terrain_entry(const char **,
                                                struct electron_test_scenario_v1 *);
staticfn void electron_test_parse_terrain_array(const char **,
                                                struct electron_test_scenario_v1 *);
staticfn void electron_test_parse_map(const char **,
                                      struct electron_test_scenario_v1 *);
staticfn void electron_test_parse_monster_entry(const char **,
                                                struct electron_test_scenario_v1 *);
staticfn void electron_test_parse_monsters(const char **,
                                           struct electron_test_scenario_v1 *);
staticfn void electron_test_parse_string_array(const char **,
                                               struct electron_test_scenario_v1 *,
                                               const char *,
                                               struct electron_test_expected_list *);
staticfn void electron_test_parse_expected_facts(const char **,
                                                 struct electron_test_scenario_v1 *);
staticfn boolean electron_test_event_result_supported(const char *, const char *);
staticfn void electron_test_parse_event_results(const char **,
                                                struct electron_test_scenario_v1 *);
staticfn void electron_test_parse_scenario_v1(const char *,
                                              struct electron_test_scenario_v1 *);
staticfn void electron_test_prepare_identity_from_scenario(void);
staticfn void electron_test_apply_identity(const struct electron_test_scenario_v1 *);
staticfn boolean electron_test_terrain_passable(int, int);
staticfn boolean electron_test_planned_accessible(const struct electron_test_scenario_v1 *,
                                                  coordxy, coordxy);
staticfn void electron_test_preflight_locations(const struct electron_test_scenario_v1 *);
staticfn void electron_test_apply_hero(const struct electron_test_scenario_v1 *);
staticfn void electron_test_apply_special_level(const struct electron_test_scenario_v1 *);
staticfn void electron_test_apply_hero_state(const struct electron_test_scenario_v1 *);
staticfn boolean electron_test_find_hero_target(const struct electron_test_scenario_v1 *,
                                                coordxy *, coordxy *);
staticfn boolean electron_test_find_spot_near_target(coordxy *, coordxy *,
                                                     coordxy, coordxy, int);
staticfn int electron_test_property_from_string(const char *);
staticfn void electron_test_apply_level(const struct electron_test_scenario_v1 *);
staticfn void electron_test_apply_terrain_tile(const char *, coordxy, coordxy,
                                               int, int, int, int);
staticfn void electron_test_apply_terrain(const struct electron_test_scenario_v1 *);
staticfn void electron_test_apply_monsters(const struct electron_test_scenario_v1 *);
staticfn void electron_test_resolve_location(const struct electron_test_location_spec *,
                                             coordxy *, coordxy *);
staticfn void electron_test_clear_adjacent_monsters(int);
staticfn void electron_test_remove_pets(void);
staticfn void electron_test_apply_object_metadata(struct obj *,
                                                  const struct electron_test_object_spec *);
staticfn struct obj *electron_test_make_object(const struct electron_test_scenario_v1 *,
                                               int, coordxy, coordxy,
                                               boolean);
staticfn void electron_test_apply_ground(const struct electron_test_scenario_v1 *);
staticfn void electron_test_clear_inventory(void);
staticfn void electron_test_apply_inventory(const struct electron_test_scenario_v1 *);
staticfn void electron_test_apply_equipment(struct obj *,
                                            const struct electron_test_object_spec *,
                                            const char *);
staticfn void electron_test_apply_event_results(const struct electron_test_scenario_v1 *);
boolean electron_test_consume_event_result(const char *, const char *);
staticfn void electron_test_json_append(char **, char *, const char *, const char *);
staticfn void electron_test_json_append_escaped(char **, char *, const char *, const char *);
staticfn void electron_test_json_append_list(char **, char *, const char *,
                                             const struct electron_test_expected_list *,
                                             const char *, boolean *);
staticfn void electron_test_build_expected_facts(const struct electron_test_scenario_v1 *,
                                                 char *, size_t);
#endif
staticfn boolean find_electron_test_spot(coordxy *, coordxy *, coordxy, coordxy);
staticfn void maybe_setup_electron_container_context_test_scene(void);
staticfn void maybe_setup_electron_container_transfer_test_scene(void);
staticfn void maybe_setup_electron_corpse_overlay_test_scene(void);
staticfn void maybe_setup_electron_locked_door_test_scene(void);
staticfn void maybe_setup_electron_shop_payment_test_scene(void);
#ifdef POSITIONBAR
staticfn void do_positionbar(void);
#endif
staticfn void regen_pw(int);
staticfn void regen_hp(int);
staticfn void interrupt_multi(const char *);
#ifdef NH_ELECTRON_TEST_FIXTURES
extern void nh_test_bridge_event(const char *, const char *, const char *, const char *)
    __attribute__((weak));
#endif

/*ARGSUSED*/
void
early_init(int argc, char *argv[])
{
    program_state_init();
#ifdef CRASHREPORT
    /* Do this as early as possible, but let ports do other things first. */
    crashreport_init(argc, argv);
#endif
    decl_globals_init();
    objects_globals_init();
    monst_globals_init();
    sys_early_init();
    runtime_info_init();
    nhUse(argc);
    nhUse(argv[0]);
}

staticfn void
moveloop_preamble(boolean resuming)
{
    /* if a save file created in normal mode is now being restored in
       explore mode, treat it as normal restore followed by 'X' command
       to use up the save file and require confirmation for explore mode */
    if (resuming && iflags.deferred_X)
        (void) enter_explore_mode();

    /* side-effects from the real world */
    flags.moonphase = phase_of_the_moon();
    if (flags.moonphase == FULL_MOON) {
        You("are lucky!  Full moon tonight.");
        change_luck(1);
    } else if (flags.moonphase == NEW_MOON) {
        pline("Be careful!  New moon tonight.");
    }
    flags.friday13 = friday_13th();
    if (flags.friday13) {
        pline("Watch out!  Bad things can happen on Friday the 13th.");
        change_luck(-1);
    }

    if (!resuming) { /* new game */
        program_state.beyond_savefile_load = 1; /* for TTY_PERM_INVENT */
        svc.context.rndencode = rnd(9000);
        set_wear((struct obj *) 0); /* for side-effects of starting gear */
        reset_justpicked(gi.invent);
        (void) pickup(1);      /* autopickup at initial location */
        /* only matters if someday a character is able to start with
           clairvoyance (wizard with cornuthaum perhaps?); without this,
           first "random" occurrence would always kick in on turn 1 */
        svc.context.seer_turn = (long) rnd(30);
        /* give hero initial movement points; new game only--for restore,
           pending movement points were included in the save file */
        u.umovement = NORMAL_SPEED;
        initrack();
    }
    disp.botlx = TRUE; /* for STATUS_HILITES */
    if (resuming) { /* restoring old game */
        read_engr_at(u.ux, u.uy); /* subset of pickup() */
        fix_shop_damage();
    }

    encumber_msg(); /* in case they auto-picked up something */
    if (gd.defer_see_monsters) {
        gd.defer_see_monsters = FALSE;
        see_monsters();
    }

    u.uz0.dlevel = u.uz.dlevel;
    svc.context.move = 0;

    /* finish processing "--debug:fuzzer" from the command line */
    if (iflags.fuzzerpending) {
        iflags.debug_fuzzer = fuzzer_impossible_panic;
        iflags.fuzzerpending = FALSE;
    }

    program_state.in_moveloop = 1;
    /* for perm_invent preset at startup, display persistent inventory after
       invent is fully populated and the in_moveloop flag has been set */
    if (iflags.perm_invent)
        update_inventory();
}

staticfn void
u_calc_moveamt(int wtcap)
{
    int moveamt = 0;

    /* calculate how much time passed. */
    if (u.usteed && u.umoved) {
        /* your speed doesn't augment steed's speed */
        moveamt = mcalcmove(u.usteed, TRUE);
    } else {
        moveamt = gy.youmonst.data->mmove;

        if (Very_fast) { /* speed boots, potion, or spell */
            /* gain a free action on 2/3 of turns */
            if (rn2(3) != 0)
                moveamt += NORMAL_SPEED;
        } else if (Fast) { /* intrinsic */
            /* gain a free action on 1/3 of turns */
            if (rn2(3) == 0)
                moveamt += NORMAL_SPEED;
        }
    }

    switch (wtcap) {
    case UNENCUMBERED:
        break;
    case SLT_ENCUMBER:
        moveamt -= (moveamt / 4);
        break;
    case MOD_ENCUMBER:
        moveamt -= (moveamt / 2);
        break;
    case HVY_ENCUMBER:
        moveamt -= ((moveamt * 3) / 4);
        break;
    case EXT_ENCUMBER:
        moveamt -= ((moveamt * 7) / 8);
        break;
    default:
        break;
    }

    u.umovement += moveamt;
    if (u.umovement < 0)
        u.umovement = 0;
}

/* small chance of generating a new random monster */
staticfn void
maybe_generate_rnd_mon(void)
{
    if (!rn2(u.uevent.udemigod ? 25
             : (depth(&u.uz) > depth(&stronghold_level)) ? 50
             : 70))
        (void) makemon((struct permonst *) 0, 0, 0, NO_MM_FLAGS);
}

#if defined(MICRO) || defined(WIN32)
static int mvl_abort_lev;
#endif
static int mvl_wtcap = 0;
static int mvl_change = 0;

void
moveloop_core(void)
{
    boolean monscanmove = FALSE;

#ifdef SAFERHANGUP
    if (program_state.done_hup)
        end_of_input();
#endif
    get_nh_event();
#ifdef POSITIONBAR
    do_positionbar();
#endif
    if (iflags.pending_customizations)
        maybe_shuffle_customizations();

    dobjsfree();

    if (svc.context.bypasses)
        clear_bypasses();

    if (iflags.sanity_check || iflags.debug_fuzzer)
        sanity_check();

    if (svc.context.resume_wish)
        makewish(); /* clears resume_wish */

    if (svc.context.move) {
        /* actual time passed */
        u.umovement -= NORMAL_SPEED;

        do { /* hero can't move this turn loop */
            encumber_msg();

            svc.context.mon_moving = TRUE;
            do {
                monscanmove = movemon();
                if (u.umovement >= NORMAL_SPEED)
                    break; /* it's now your turn */
            } while (monscanmove);
            svc.context.mon_moving = FALSE;

            /* this needs to be after the monster movement loop in
               case monster actions affected burden, e.g. rehumanize */
            mvl_wtcap = near_capacity();

            if (!monscanmove && u.umovement < NORMAL_SPEED) {
                /* both hero and monsters are out of steam this round */
                struct monst *mtmp;

                /* set up for a new turn */
                gw.were_changes = 0L;
                mcalcdistress(); /* adjust monsters' trap, blind, etc */

                /* reallocate movement rations to monsters; don't need
                   to skip dead monsters here because they will have
                   been purged at end of their previous round of moving */
                for (mtmp = fmon; mtmp; mtmp = mtmp->nmon)
                    mtmp->movement += mcalcmove(mtmp, TRUE);

                /* occasionally add another monster; since this takes
                   place after movement has been allotted, the new
                   monster effectively loses its first turn */
                maybe_generate_rnd_mon();

                u_calc_moveamt(mvl_wtcap);
                settrack();

                svm.moves++;
                /*
                 * Never allow 'moves' to grow big enough to wrap.
                 * We don't care what the maximum possible 'long int'
                 * is for the current configuration, we want a value
                 * that is the same for all viable configurations.
                 * When imposing the limit, use a mystic decimal value
                 * instead of a magic binary one such as 0x7fffffffL.
                 */
                if (svm.moves >= 1000000000L) {
                    display_nhwindow(WIN_MESSAGE, TRUE);
                    urgent_pline("The dungeon capitulates.");
                    done(ESCAPED);
                }
                /* 'moves' is misnamed; it represents turns; hero_seq is
                   a value that is distinct every time the hero moves */
                gh.hero_seq = svm.moves << 3;

                if (flags.time && !svc.context.run)
                    disp.time_botl = TRUE; /* 'moves' just changed */

                /********************************/
                /* once-per-turn things go here */
                /********************************/

                l_nhcore_call(NHCORE_MOVELOOP_TURN);

                if (Glib)
                    glibr();
                nh_timeout();
                run_regions();

                if (u.ublesscnt)
                    u.ublesscnt--;

                /* One possible result of prayer is healing.  Whether or
                 * not you get healed depends on your current hit points.
                 * If you are allowed to regenerate during the prayer,
                 * the end-of-prayer calculation messes up on this.
                 * Another possible result is rehumanization, which
                 * requires that encumbrance and movement rate be
                 * recalculated.
                 */
                if (u.uinvulnerable) {
                    /* for the moment at least, you're in tiptop shape */
                    mvl_wtcap = UNENCUMBERED;
                } else if (!Upolyd ? (u.uhp < u.uhpmax)
                           : (u.mh < u.mhmax
                              || gy.youmonst.data->mlet == S_EEL)) {
                    /* maybe heal */
                    regen_hp(mvl_wtcap);
                }

                /* moving around while encumbered is hard work */
                if (mvl_wtcap > MOD_ENCUMBER && u.umoved) {
                    if (!(mvl_wtcap < EXT_ENCUMBER ? svm.moves % 30
                          : svm.moves % 10)) {
                        overexert_hp();
                    }
                }

                regen_pw(mvl_wtcap);

                if (!u.uinvulnerable) {
                    if (Teleportation && !rn2(85)) {
                        coordxy old_ux = u.ux, old_uy = u.uy;

                        tele();
                        if (u.ux != old_ux || u.uy != old_uy) {
                            if (!next_to_u()) {
                                check_leash(old_ux, old_uy);
                            }
                            /* clear doagain keystrokes */
                            cmdq_clear(CQ_CANNED);
                            cmdq_clear(CQ_REPEAT);
                        }
                    }
                    /* delayed change may not be valid anymore */
                    if ((mvl_change == 1 && !Polymorph)
                        || (mvl_change == 2 && u.ulycn == NON_PM))
                        mvl_change = 0;
                    if (Polymorph && !rn2(100))
                        mvl_change = 1;
                    else if (ismnum(u.ulycn) && !Upolyd
                             && !rn2(80 - (20 * night())))
                        mvl_change = 2;
                    if (mvl_change && !Unchanging) {
                        if (gm.multi >= 0) {
                            stop_occupation();
                            if (mvl_change == 1)
                                polyself(POLY_NOFLAGS);
                            else
                                you_were();
                            mvl_change = 0;
                        }
                    }
                }

                if (Searching && !svl.level.flags.noautosearch
                    && gm.multi >= 0)
                    (void) dosearch0(1);
                if (Warning)
                    warnreveal();
                if (gw.were_changes) {
                    /* update innate intrinsics (mainly Drain_resistance) */
                    set_uasmon();
                }
                mkot_trap_warn();
                dosounds();
                do_storms();
                gethungry();
                age_spells();
                exerchk();
                invault();
                if (u.uhave.amulet)
                    amulet();
                if (!rn2(40 + (int) (ACURR(A_DEX) * 3)))
                    u_wipe_engr(rnd(3));
                if (u.uevent.udemigod && !u.uinvulnerable) {
                    if (u.udg_cnt)
                        u.udg_cnt--;
                    if (!u.udg_cnt) {
                        intervene();
                        u.udg_cnt = rn1(200, 50);
                    }
                }
/* XXX This should be recoded to use something like regions - a list of
 * things that are active and need to be handled that is dynamically
 * maintained and not a list of special cases. */
                /* vision will be updated as bubbles move */
                if (Is_waterlevel(&u.uz) || Is_airlevel(&u.uz))
                    movebubbles();
                else if (svl.level.flags.fumaroles)
                    fumaroles();

                /* when immobile, count is in turns */
                if (gm.multi < 0) {
                    runmode_delay_output();
                    if (++gm.multi == 0) { /* finished yet? */
                        unmul((char *) 0);
                        /* if unmul caused a level change, take it now */
                        if (u.utotype)
                            deferred_goto();
                    }
                }
            }
        } while (u.umovement < NORMAL_SPEED); /* hero can't move */

        /******************************************/
        /* once-per-hero-took-time things go here */
        /******************************************/

        gh.hero_seq++; /* moves*8 + n for n == 1..7 */

        /* although we checked for encumbrance above, we need to
           check again for message purposes, as the weight of
           inventory may have changed in, e.g., nh_timeout(); we do
           need two checks here so that the player gets feedback
           immediately if their own action encumbered them */
        encumber_msg();

#ifdef STATUS_HILITES
        if (iflags.hilite_delta)
            status_eval_next_unhilite();
#endif
        if (svm.moves >= svc.context.seer_turn) {
            if ((u.uhave.amulet || Clairvoyant) && !In_endgame(&u.uz)
                && !BClairvoyant)
                do_vicinity_map((struct obj *) 0);
            /* we maintain this counter even when clairvoyance isn't
               taking place; on average, go again 30 turns from now */
            svc.context.seer_turn = svm.moves + (long) rn1(31, 15); /*15..45*/
            /* [it used to be that on every 15th turn, there was a 50%
               chance of farsight, so it could happen as often as every
               15 turns or theoretically never happen at all; but when
               a fast hero got multiple moves on that 15th turn, it
               could actually happen more than once on the same turn!] */
        }
        /* [fast hero who gets multiple moves per turn ends up sinking
           multiple times per turn; is that what we really want?] */
        if (u.utrap && u.utraptype == TT_LAVA)
            sink_into_lava();
        /* when/if hero escapes from lava, he can't just stay there */
        else if (!u.umoved)
            (void) pooleffects(FALSE);

        /* vision while buried or underwater is updated here */
        if (Underwater)
            under_water(0);
        else if (u.uburied)
            under_ground(0);

        see_nearby_monsters();
    } /* actual time passed */

    /****************************************/
    /* once-per-player-input things go here */
    /****************************************/

    clear_splitobjs();

    /* the Amulet of Yendor gives a wish when initially picked up */
    if (u.uhave.amulet && !u.uevent.amulet_wish) {
        u.uevent.amulet_wish = 1;
        display_nhwindow(WIN_MESSAGE, TRUE);
        urgent_pline("The Amulet is bestowing a wish upon you!");
        makewish();
    }

    find_ac();
    if (!svc.context.mv || Blind) {
        /* redo monsters if hallu or wearing a helm of telepathy */
        if (Hallucination) { /* update screen randomly */
            see_monsters();
            see_objects();
            see_traps();
            if (u.uswallow)
                swallowed(0);
        } else if (Unblind_telepat || Warning || Warn_of_mon
                   /* this is needed for the case where you saw a monster
                      due to being next to it while it's in a gas cloud
                      and then you moved away; it should no longer be seen
                      when that happens, even if it hasn't moved */
                   || any_visible_region()) { /* TODO: optimize this */
            see_monsters();
        }
        if (gv.vision_full_recalc)
            vision_recalc(0); /* vision! */
    }
    if (disp.botl || disp.botlx) {
        bot();
        curs_on_u();
    } else if (disp.time_botl) {
        timebot();
        curs_on_u();
    }

    m_everyturn_effect(&gy.youmonst);

    svc.context.move = 1;

    if (gm.multi >= 0 && go.occupation) {
#if defined(MICRO) || defined(WIN32CON)
        mvl_abort_lev = 0;
        if (kbhit()) {
            char ch;

            if ((ch = pgetchar()) == ABORT)
                mvl_abort_lev++;
            else
                cmdq_add_key(CQ_CANNED, ch);
        }
        if (!mvl_abort_lev && (*go.occupation)() == 0)
#else
            if ((*go.occupation)() == 0)
#endif
                go.occupation = 0;
        if (
#if defined(MICRO) || defined(WIN32)
            mvl_abort_lev ||
#endif
            monster_nearby()) {
            stop_occupation();
            reset_eat();
        }
        runmode_delay_output();
        return;
    }

    u.umoved = FALSE;

    if (gm.multi > 0) {
        lookaround();
        runmode_delay_output();
        if (!gm.multi) {
            /* lookaround may clear multi */
            svc.context.move = 0;
            return;
        }
        if (svc.context.mv) {
            if (gm.multi < COLNO && !--gm.multi)
                end_running(TRUE);
            domove();
        } else {
            --gm.multi;
            nhassert(gc.command_count != 0);
            rhack(gc.cmd_key);
        }
    } else if (gm.multi == 0) {
#ifdef MAIL
        ckmailstatus();
#endif
        rhack(0);
    }
    if (u.utotype)       /* change dungeon level */
        deferred_goto(); /* after rhack() */

    if (gv.vision_full_recalc)
        vision_recalc(0); /* vision! */
#ifdef CLIPPING
    /* after rhack() and vision_recalc() so that the map is redrawn
       once with correct vision data, not twice (overshoot+correct) */
    cliparound(u.ux, u.uy);
#endif
    /* when running in non-tport mode, this gets done through domove() */
    if ((!svc.context.run || flags.runmode == RUN_TPORT)
        && (gm.multi && (!svc.context.travel ? !(gm.multi % 7)
                        : !(svm.moves % 7L)))) {
        if (flags.time && svc.context.run)
            disp.botl = TRUE;
        /* [should this be flush_screen() instead?] */
        display_nhwindow(WIN_MAP, FALSE);
    }

    if (gl.luacore && nhcb_counts[NHCB_END_TURN]) {
        lua_getglobal(gl.luacore, "nh_callback_run");
        lua_pushstring(gl.luacore, nhcb_name[NHCB_END_TURN]);
        nhl_pcall_handle(gl.luacore, 1, 0, "moveloop_core", NHLpa_panic);
        lua_settop(gl.luacore, 0);
    }
}

staticfn void
maybe_do_tutorial(void)
{
    s_level *sp = find_level("tut-1");

    if (!sp)
        return;

    if (ask_do_tutorial()) {
        assign_level(&u.ucamefrom, &u.uz);
        iflags.nofollowers = TRUE;
        schedule_goto(&sp->dlevel, UTOTYPE_NONE,
                      "Entering the tutorial.", (char *) 0);
        deferred_goto();
        vision_recalc(0);
        docrt();
        iflags.nofollowers = FALSE;
    } else {
        /* no tutorial, so okay to process mention_decor now */
        rcfile_only_this_option(opt_mention_decor);
    }
}

void
moveloop(boolean resuming)
{
    moveloop_preamble(resuming);

    if (!resuming)
        maybe_do_tutorial();

    /* process one deferred option post-tutorial */
    rcfile_only_this_option(opt_mention_decor);

    for (;;) {
        moveloop_core();
    }
}

staticfn void
regen_pw(int wtcap)
{
    if (u.uen < u.uenmax
        && ((wtcap < MOD_ENCUMBER
             && (!(svm.moves % ((MAXULEV + 8 - u.ulevel)
                              * (Role_if(PM_WIZARD) ? 3 : 4)
                              / 6)))) || Energy_regeneration)) {
        int upper = (int) (ACURR(A_WIS) + ACURR(A_INT)) / 15 + 1;

        if (EMagical_breathing)
            upper += 2;

        u.uen += rn1(upper, 1);
        if (u.uen > u.uenmax)
            u.uen = u.uenmax;
        disp.botl = TRUE;
        if (u.uen == u.uenmax)
            interrupt_multi("You feel full of energy.");
    }
}

#define U_CAN_REGEN() (Regeneration || (Sleepy && u.usleep))

/* maybe recover some lost health (or lose some when an eel out of water) */
staticfn void
regen_hp(int wtcap)
{
    int heal = 0;
    boolean reached_full = FALSE,
            encumbrance_ok = (wtcap < MOD_ENCUMBER || !u.umoved);

    if (Upolyd) {
        if (u.mh < 1) { /* shouldn't happen... */
            rehumanize();
        } else if (gy.youmonst.data->mlet == S_EEL
                   && !is_pool(u.ux, u.uy) && !Is_waterlevel(&u.uz)
                   && !Breathless) {
            /* eel out of water loses hp, similar to monster eels;
               as hp gets lower, rate of further loss slows down */
            if (u.mh > 1 && !Regeneration && rn2(u.mh) > rn2(8)
                && (!Half_physical_damage || !(svm.moves % 2L)))
                heal = -1;
        } else if (u.mh < u.mhmax) {
            if (U_CAN_REGEN() || (encumbrance_ok && !(svm.moves % 20L)))
                heal = 1;
        }
        if (heal) {
            disp.botl = TRUE;
            u.mh += heal;
            reached_full = (u.mh == u.mhmax);
        }

    /* !Upolyd */
    } else {
        /* [when this code was in-line within moveloop(), there was
           no !Upolyd check here, so poly'd hero recovered lost u.uhp
           once u.mh reached u.mhmax; that may have been convenient
           for the player, but it didn't make sense for gameplay...] */
        if (u.uhp < u.uhpmax && (encumbrance_ok || U_CAN_REGEN())) {
            heal = (u.ulevel + (int)ACURR(A_CON)) > rn2(100);

            if (U_CAN_REGEN())
                heal += 1;
            if (Sleepy && u.usleep)
                heal++;

            if (heal) {
                disp.botl = TRUE;
                u.uhp += heal;
                if (u.uhp > u.uhpmax)
                    u.uhp = u.uhpmax;
                /* stop voluntary multi-turn activity if now fully healed */
                reached_full = (u.uhp == u.uhpmax);
            }
        }
    }

    if (reached_full)
        interrupt_multi("You are in full health.");
}

#undef U_CAN_REGEN

void
stop_occupation(void)
{
    if (go.occupation) {
        if (!maybe_finished_meal(TRUE))
            You("stop %s.", go.occtxt);
        go.occupation = (int (*)(void)) 0;
        disp.botl = TRUE; /* in case u.uhs changed */
        nomul(0);
    } else if (gm.multi >= 0) {
        nomul(0);
    }
    cmdq_clear(CQ_CANNED);
}

#ifdef NH_ELECTRON_TEST_FIXTURES
staticfn void
electron_test_fixture_event(const char *name, const char *id,
                            const char *message, const char *facts)
{
    if (nh_test_bridge_event)
        nh_test_bridge_event(name, id ? id : "", message ? message : "",
                             facts ? facts : "");
}

staticfn void
electron_test_fixture_fail(const char *id, const char *message)
{
    electron_test_fixture_event("bridge_test_scenario_failed", id, message, "");
    nh_terminate(EXIT_FAILURE);
}

staticfn void
electron_test_require_runtime_gate(const char *id)
{
    const char *gate = nh_getenv("NH_ELECTRON_TEST_FIXTURES");
    if (!gate || strcmp(gate, "1"))
        electron_test_fixture_fail(id,
            "fixture scenarios require explicit NH_ELECTRON_TEST_FIXTURES=1 runtime gate");
}

#define ELECTRON_TEST_SCENARIO_SCHEMA_V1 "nethack-electron-test-scenario/v1"
#define ELECTRON_TEST_SCENARIO_SCHEMA_V2 "nethack-electron-test-scenario/v2"
#define ELECTRON_TEST_SCENARIO_PHASE_V1 "after-level-and-hero-before-first-draw"
#define ELECTRON_TEST_SCENARIO_PHASE_V2 "after-special-level-and-hero-before-first-draw"
#define ELECTRON_TEST_MAX_OBJECTS 80
#define ELECTRON_TEST_MAX_GROUND 32
#define ELECTRON_TEST_MAX_INTRINSICS 16
#define ELECTRON_TEST_MAX_INVENTORY 32
#define ELECTRON_TEST_MAX_MONSTERS 24
#define ELECTRON_TEST_MAX_TERRAIN 128
#define ELECTRON_TEST_MAX_MAP_ROWS 15
#define ELECTRON_TEST_MAX_MAP_COLS 31
#define ELECTRON_TEST_MAX_FACTS 24
#define ELECTRON_TEST_FACT_LEN 128
#define ELECTRON_TEST_MAX_EVENT_RESULTS 16
#define ELECTRON_TEST_EVENT_RESULT_LEN 48

#define ELECTRON_TEST_EQUIP_NONE 0
#define ELECTRON_TEST_EQUIP_WIELDED 1
#define ELECTRON_TEST_EQUIP_WORN 2
#define ELECTRON_TEST_EQUIP_QUIVERED 3

#define ELECTRON_TEST_HERO_CURRENT 0
#define ELECTRON_TEST_HERO_NEAREST_SAFE_FLOOR 1
#define ELECTRON_TEST_HERO_NEAR_MONSTER 2
#define ELECTRON_TEST_HERO_ON_TERRAIN 5
#define ELECTRON_TEST_HERO_ON_INVOCATION_POSITION 6
#define ELECTRON_TEST_HERO_NEAR_OBJECT 3
#define ELECTRON_TEST_HERO_NEAR_TERRAIN 4
#define ELECTRON_TEST_EQUIP_LEFT_RING 4
#define ELECTRON_TEST_EQUIP_RIGHT_RING 5

#define ELECTRON_TEST_BEATITUDE_UNSET 99

struct electron_test_expected_list {
    int count;
    char value[ELECTRON_TEST_MAX_FACTS][ELECTRON_TEST_FACT_LEN];
};

struct electron_test_location_spec {
    boolean absolute;
    int x, y;
    int dx, dy;
};

struct electron_test_object_spec {
    int type_id;
    long quantity;
    boolean quantity_present;
    boolean identity_known_present, identity_known;
    boolean beatitude_known_present, beatitude_known;
    int beatitude;
    boolean charges_present;
    int charges;
    boolean fuel_present;
    long fuel;
    boolean enchantment_present;
    int enchantment;
    boolean erosion_present;
    int erosion;
    boolean corrosion_present;
    int corrosion;
    boolean poisoned_present, poisoned;
    boolean called_name_present, individual_name_present;
    char called_name[PL_PSIZ], individual_name[PL_PSIZ];
    int equip_state;
    boolean locked_present, locked;
    boolean lock_known_present, lock_known;
    boolean trap_present, trapped;
    boolean corpse_monster_present;
    int corpse_monster_id;
    boolean contents_present;
    int first_content, content_count;
};

struct electron_test_ground_spec {
    struct electron_test_location_spec loc;
    int object_index;
};

struct electron_test_terrain_spec {
    struct electron_test_location_spec loc;
    int typ;
    int door_mask;
    int trap;
    int stair_down; /* -1 for non-stairs/unspecified, 0 up, 1 down */
};

struct electron_test_map_spec {
    boolean present;
    struct electron_test_location_spec top_left;
    int row_count, col_count;
    char rows[ELECTRON_TEST_MAX_MAP_ROWS][ELECTRON_TEST_MAX_MAP_COLS + 1];
};

struct electron_test_monster_spec {
    struct electron_test_location_spec loc;
    int monster_id;
    int attitude;
    boolean asleep_present, asleep;
    boolean hp_present;
    int hp, maxhp;
};

struct electron_test_event_result_spec {
    char event[ELECTRON_TEST_EVENT_RESULT_LEN];
    char result[ELECTRON_TEST_EVENT_RESULT_LEN];
    boolean consumed;
};

struct electron_test_scenario_v1 {
    char id[BUFSZ];
    int schema_version;
    int phase_version;
    boolean v2_fields_present;
    int hero_placement;
    int hero_placement_target;
    int hero_placement_distance;
    boolean special_level_present;
    char special_level[32];
    boolean experience_level_present;
    int experience_level;
    boolean hp_present;
    int hp, maxhp;
    boolean power_present;
    int power, maxpower;
    boolean amulet_wish_complete;
    boolean alignment_record_present;
    int alignment_record;
    boolean wake_placement_target;
    int intrinsic_count;
    int intrinsics[ELECTRON_TEST_MAX_INTRINSICS];
    boolean role_present, race_present, gender_present, alignment_present;
    int role, race, gender, alignment;
    int safe_area;
    boolean level_lit;
    boolean suppress_adjacent_monsters;
    boolean pet_none;
    struct electron_test_terrain_spec terrain[ELECTRON_TEST_MAX_TERRAIN];
    int terrain_count;
    struct electron_test_map_spec map;
    struct electron_test_object_spec objects[ELECTRON_TEST_MAX_OBJECTS];
    int object_count;
    struct electron_test_ground_spec ground[ELECTRON_TEST_MAX_GROUND];
    int ground_count;
    struct electron_test_monster_spec monsters[ELECTRON_TEST_MAX_MONSTERS];
    int monster_count;
    int inventory[ELECTRON_TEST_MAX_INVENTORY];
    int inventory_count;
    struct electron_test_event_result_spec event_results[ELECTRON_TEST_MAX_EVENT_RESULTS];
    int event_result_count;
    unsigned expected_seen;
    struct electron_test_expected_list context_actions;
    struct electron_test_expected_list container_rows;
    struct electron_test_expected_list inventory_rows;
    struct electron_test_expected_list equipment_rows;
    struct electron_test_expected_list ground_rows;
    struct electron_test_expected_list monster_rows;
    struct electron_test_expected_list map_affordances;
    struct electron_test_expected_list messages;
    struct electron_test_expected_list status;
};

static struct electron_test_event_result_spec electron_test_active_event_results[ELECTRON_TEST_MAX_EVENT_RESULTS];
static int electron_test_active_event_result_count = 0;

staticfn void
electron_test_validate_resolved_path(const char *path, const char *id)
{
    char suffix[BUFSZ];
    size_t path_len, suffix_len, i;

    if (!id || !*id)
        electron_test_fixture_fail("", "NH_TEST_SCENARIO_ID is required for fixture scenarios");
    for (i = 0; id[i]; ++i) {
        unsigned char ch = (unsigned char) id[i];
        if (!(isalnum(ch) || ch == '/' || ch == '_' || ch == '-'))
            electron_test_fixture_fail(id, "invalid scenario id");
        if (ch == '/' && (!i || !id[i + 1]))
            electron_test_fixture_fail(id, "invalid scenario id");
        if (ch == '.' && id[i + 1] == '.')
            electron_test_fixture_fail(id, "invalid scenario id");
    }
    (void) snprintf(suffix, sizeof suffix,
                    "/electron-poc/test/scenarios/%s.json", id);
    if (strlen(suffix) + 1 >= sizeof suffix)
        electron_test_fixture_fail(id, "scenario path is too long");
    path_len = strlen(path);
    suffix_len = strlen(suffix);
    if (path_len < suffix_len
        || strcmp(path + path_len - suffix_len, suffix))
        electron_test_fixture_fail(id, "NH_TEST_SCENARIO must be resolved from NH_TEST_SCENARIO_ID");
}

staticfn char *
electron_test_read_file(const char *path)
{
    FILE *fp;
    long len;
    char *buf;

    if (!path || !*path || path[0] != '/')
        electron_test_fixture_fail("", "NH_TEST_SCENARIO must be an absolute path");
    fp = fopen(path, "rb");
    if (!fp)
        electron_test_fixture_fail("", "unable to open NH_TEST_SCENARIO");
    if (fseek(fp, 0L, SEEK_END) != 0)
        electron_test_fixture_fail("", "unable to seek NH_TEST_SCENARIO");
    len = ftell(fp);
    if (len < 0L || len > 65536L)
        electron_test_fixture_fail("", "NH_TEST_SCENARIO size is invalid");
    rewind(fp);
    buf = (char *) alloc((unsigned) len + 1U);
    if (fread(buf, 1, (size_t) len, fp) != (size_t) len) {
        fclose(fp);
        free(buf);
        electron_test_fixture_fail("", "unable to read NH_TEST_SCENARIO");
    }
    fclose(fp);
    buf[len] = '\0';
    return buf;
}

staticfn const char *
electron_json_ws(const char *p)
{
    while (p && *p && isspace((uchar) *p))
        ++p;
    return p;
}

staticfn void
electron_json_fail(const char *id, const char *message)
{
    electron_test_fixture_fail(id && *id ? id : "", message);
}

staticfn void
electron_json_expect_char(const char **pp, int ch, const char *id,
                          const char *message)
{
    const char *p = electron_json_ws(*pp);
    if (*p != ch)
        electron_json_fail(id, message);
    *pp = p + 1;
}

staticfn boolean
electron_json_consume_char(const char **pp, int ch)
{
    const char *p = electron_json_ws(*pp);
    if (*p == ch) {
        *pp = p + 1;
        return TRUE;
    }
    return FALSE;
}

staticfn boolean
electron_json_peek_char(const char **pp, int ch)
{
    const char *p = electron_json_ws(*pp);
    return *p == ch;
}

staticfn char *
electron_json_parse_string(const char **pp, const char *id)
{
    const char *p = electron_json_ws(*pp);
    char *out, *q;
    size_t maxlen;

    if (*p != '"')
        electron_json_fail(id, "expected JSON string");
    ++p;
    maxlen = strlen(p) + 1;
    out = (char *) alloc((unsigned) maxlen);
    q = out;
    while (*p && *p != '"') {
        unsigned char c = (unsigned char) *p++;
        if (c < 0x20) {
            free(out);
            electron_json_fail(id, "control character in JSON string");
        }
        if (c == '\\') {
            int esc = (unsigned char) *p++;
            switch (esc) {
            case '"': *q++ = '"'; break;
            case '\\': *q++ = '\\'; break;
            case '/': *q++ = '/'; break;
            case 'b': *q++ = '\b'; break;
            case 'f': *q++ = '\f'; break;
            case 'n': *q++ = '\n'; break;
            case 'r': *q++ = '\r'; break;
            case 't': *q++ = '\t'; break;
            case 'u':
                free(out);
                electron_json_fail(id,
                    "JSON unicode escapes are not supported; use literal UTF-8");
                break;
            default:
                free(out);
                electron_json_fail(id, "invalid JSON string escape");
            }
        } else {
            *q++ = (char) c;
        }
    }
    if (*p != '"') {
        free(out);
        electron_json_fail(id, "unterminated JSON string");
    }
    *q = '\0';
    *pp = p + 1;
    return out;
}

staticfn long
electron_json_parse_int(const char **pp, const char *id)
{
    const char *p = electron_json_ws(*pp), *start = p;
    long value = 0L;
    int sign = 1;

    if (*p == '-') {
        sign = -1;
        ++p;
    }
    if (!isdigit((uchar) *p))
        electron_json_fail(id, "expected JSON integer");
    if (*p == '0') {
        ++p;
        if (isdigit((uchar) *p))
            electron_json_fail(id, "invalid JSON integer");
    } else {
        while (isdigit((uchar) *p)) {
            if (value > 1000000L)
                electron_json_fail(id, "JSON integer is too large");
            value = value * 10L + (long) (*p - '0');
            ++p;
        }
    }
    if (*p == '.' || *p == 'e' || *p == 'E')
        electron_json_fail(id, "expected JSON integer, not decimal");
    if (p == start || (sign < 0 && p == start + 1))
        electron_json_fail(id, "expected JSON integer");
    *pp = p;
    return sign * value;
}

staticfn boolean
electron_json_parse_bool(const char **pp, const char *id)
{
    const char *p = electron_json_ws(*pp);
    if (!strncmp(p, "true", 4) && !isalnum((uchar) p[4]) && p[4] != '_') {
        *pp = p + 4;
        return TRUE;
    }
    if (!strncmp(p, "false", 5) && !isalnum((uchar) p[5]) && p[5] != '_') {
        *pp = p + 5;
        return FALSE;
    }
    electron_json_fail(id, "expected JSON boolean");
    return FALSE;
}

staticfn void
electron_json_require_unique(unsigned *seen, unsigned bit, const char *id,
                             const char *field)
{
    char buf[BUFSZ];
    if (*seen & bit) {
        Sprintf(buf, "duplicate JSON scenario field: %s", field);
        electron_json_fail(id, buf);
    }
    *seen |= bit;
}

staticfn void
electron_json_expect_string_value(const char **pp, const char *id,
                                  const char *expected,
                                  const char *message)
{
    char *value = electron_json_parse_string(pp, id);
    boolean ok = !strcmp(value, expected);
    free(value);
    if (!ok)
        electron_json_fail(id, message);
}

staticfn int
electron_test_type_id_from_string(const char *type_id)
{
    if (!strcmp(type_id, "CHEST")) return CHEST;
    if (!strcmp(type_id, "LARGE_BOX")) return LARGE_BOX;
    if (!strcmp(type_id, "SACK")) return SACK;
    if (!strcmp(type_id, "BAG_OF_HOLDING")) return BAG_OF_HOLDING;
    if (!strcmp(type_id, "FOOD_RATION")) return FOOD_RATION;
    if (!strcmp(type_id, "TRIPE_RATION")) return TRIPE_RATION;
    if (!strcmp(type_id, "APPLE")) return APPLE;
    if (!strcmp(type_id, "CORPSE")) return CORPSE;
    if (!strcmp(type_id, "DAGGER")) return DAGGER;
    if (!strcmp(type_id, "ORCISH_DAGGER")) return ORCISH_DAGGER;
    if (!strcmp(type_id, "KNIFE")) return KNIFE;
    if (!strcmp(type_id, "SHORT_SWORD")) return SHORT_SWORD;
    if (!strcmp(type_id, "LONG_SWORD")) return LONG_SWORD;
    if (!strcmp(type_id, "ARROW")) return ARROW;
    if (!strcmp(type_id, "BOW")) return BOW;
    if (!strcmp(type_id, "QUARTERSTAFF")) return QUARTERSTAFF;
    if (!strcmp(type_id, "PICK_AXE")) return PICK_AXE;
    if (!strcmp(type_id, "LEATHER_ARMOR")) return LEATHER_ARMOR;
    if (!strcmp(type_id, "CHAIN_MAIL")) return CHAIN_MAIL;
    if (!strcmp(type_id, "T_SHIRT")) return T_SHIRT;
    if (!strcmp(type_id, "HAWAIIAN_SHIRT")) return HAWAIIAN_SHIRT;
    if (!strcmp(type_id, "HELMET")) return HELMET;
    if (!strcmp(type_id, "ORCISH_HELM")) return ORCISH_HELM;
    if (!strcmp(type_id, "SMALL_SHIELD")) return SMALL_SHIELD;
    if (!strcmp(type_id, "LEATHER_CLOAK")) return LEATHER_CLOAK;
    if (!strcmp(type_id, "CLOAK_OF_PROTECTION")) return CLOAK_OF_PROTECTION;
    if (!strcmp(type_id, "LOW_BOOTS")) return LOW_BOOTS;
    if (!strcmp(type_id, "SPEED_BOOTS")) return SPEED_BOOTS;
    if (!strcmp(type_id, "TIN_OPENER")) return TIN_OPENER;
    if (!strcmp(type_id, "LOCK_PICK")) return LOCK_PICK;
    if (!strcmp(type_id, "SKELETON_KEY")) return SKELETON_KEY;
    if (!strcmp(type_id, "OIL_LAMP")) return OIL_LAMP;
    if (!strcmp(type_id, "MAGIC_MARKER")) return MAGIC_MARKER;
    if (!strcmp(type_id, "STETHOSCOPE")) return STETHOSCOPE;
    if (!strcmp(type_id, "TOWEL")) return TOWEL;
    if (!strcmp(type_id, "SCR_IDENTIFY")) return SCR_IDENTIFY;
    if (!strcmp(type_id, "SCR_REMOVE_CURSE")) return SCR_REMOVE_CURSE;
    if (!strcmp(type_id, "SCR_ENCHANT_WEAPON")) return SCR_ENCHANT_WEAPON;
    if (!strcmp(type_id, "SPE_JUMPING")) return SPE_JUMPING;
    if (!strcmp(type_id, "SPE_CHAIN_LIGHTNING")) return SPE_CHAIN_LIGHTNING;
    if (!strcmp(type_id, "POT_HEALING")) return POT_HEALING;
    if (!strcmp(type_id, "POT_EXTRA_HEALING")) return POT_EXTRA_HEALING;
    if (!strcmp(type_id, "POT_MONSTER_DETECTION")) return POT_MONSTER_DETECTION;
    if (!strcmp(type_id, "WAN_DIGGING")) return WAN_DIGGING;
    if (!strcmp(type_id, "WAN_MAGIC_MISSILE")) return WAN_MAGIC_MISSILE;
    if (!strcmp(type_id, "WAN_STRIKING")) return WAN_STRIKING;
    if (!strcmp(type_id, "RIN_PROTECTION")) return RIN_PROTECTION;
    if (!strcmp(type_id, "RIN_ADORNMENT")) return RIN_ADORNMENT;
    if (!strcmp(type_id, "AMULET_OF_REFLECTION")) return AMULET_OF_REFLECTION;
    if (!strcmp(type_id, "FLINT")) return FLINT;
    if (!strcmp(type_id, "TOUCHSTONE")) return TOUCHSTONE;
    if (!strcmp(type_id, "LUCKSTONE")) return LUCKSTONE;
    if (!strcmp(type_id, "LOADSTONE")) return LOADSTONE;
    if (!strcmp(type_id, "ROCK")) return ROCK;
    if (!strcmp(type_id, "BOULDER")) return BOULDER;
    if (!strcmp(type_id, "GOLD_PIECE")) return GOLD_PIECE;
    if (!strcmp(type_id, "AMULET_OF_YENDOR")) return AMULET_OF_YENDOR;
    if (!strcmp(type_id, "CANDELABRUM_OF_INVOCATION")) return CANDELABRUM_OF_INVOCATION;
    if (!strcmp(type_id, "BELL_OF_OPENING")) return BELL_OF_OPENING;
    if (!strcmp(type_id, "SPE_BOOK_OF_THE_DEAD")) return SPE_BOOK_OF_THE_DEAD;
    return STRANGE_OBJECT;
}

staticfn int
electron_test_monster_id_from_string(const char *monster_id)
{
    if (!strcmp(monster_id, "JACKAL")) return PM_JACKAL;
    if (!strcmp(monster_id, "GRID_BUG")) return PM_GRID_BUG;
    if (!strcmp(monster_id, "GOBLIN")) return PM_GOBLIN;
    if (!strcmp(monster_id, "KOBOLD")) return PM_KOBOLD;
    if (!strcmp(monster_id, "SEWER_RAT")) return PM_SEWER_RAT;
    if (!strcmp(monster_id, "LICHEN")) return PM_LICHEN;
    if (!strcmp(monster_id, "NEWT")) return PM_NEWT;
    if (!strcmp(monster_id, "BAT")) return PM_BAT;
    if (!strcmp(monster_id, "DWARF")) return PM_DWARF;
    if (!strcmp(monster_id, "WEREJACKAL")) return PM_WEREJACKAL;
    if (!strcmp(monster_id, "HUMAN_WEREJACKAL")) return PM_HUMAN_WEREJACKAL;
    if (!strcmp(monster_id, "GNOME")) return PM_GNOME;
    if (!strcmp(monster_id, "KITTEN")) return PM_KITTEN;
    if (!strcmp(monster_id, "LITTLE_DOG")) return PM_LITTLE_DOG;
    if (!strcmp(monster_id, "DOG")) return PM_DOG;
    if (!strcmp(monster_id, "LARGE_DOG")) return PM_LARGE_DOG;
    if (!strcmp(monster_id, "MEDUSA")) return PM_MEDUSA;
    if (!strcmp(monster_id, "WIZARD_OF_YENDOR")) return PM_WIZARD_OF_YENDOR;
    if (!strcmp(monster_id, "NORN")) return PM_NORN;
    return NON_PM;
}

staticfn int
electron_test_property_from_string(const char *name)
{
    if (!strcmp(name, "fire-resistance")) return FIRE_RES;
    if (!strcmp(name, "cold-resistance")) return COLD_RES;
    if (!strcmp(name, "sleep-resistance")) return SLEEP_RES;
    if (!strcmp(name, "disintegration-resistance")) return DISINT_RES;
    if (!strcmp(name, "shock-resistance")) return SHOCK_RES;
    if (!strcmp(name, "poison-resistance")) return POISON_RES;
    if (!strcmp(name, "acid-resistance")) return ACID_RES;
    if (!strcmp(name, "stone-resistance")) return STONE_RES;
    if (!strcmp(name, "drain-resistance")) return DRAIN_RES;
    if (!strcmp(name, "sickness-resistance")) return SICK_RES;
    if (!strcmp(name, "antimagic")) return ANTIMAGIC;
    if (!strcmp(name, "see-invisible")) return SEE_INVIS;
    if (!strcmp(name, "telepathy")) return TELEPAT;
    if (!strcmp(name, "warning")) return WARNING;
    if (!strcmp(name, "searching")) return SEARCHING;
    if (!strcmp(name, "infravision")) return INFRAVISION;
    if (!strcmp(name, "stealth")) return STEALTH;
    if (!strcmp(name, "teleport-control")) return TELEPORT_CONTROL;
    if (!strcmp(name, "flying")) return FLYING;
    if (!strcmp(name, "swimming")) return SWIMMING;
    if (!strcmp(name, "magical-breathing")) return MAGICAL_BREATHING;
    if (!strcmp(name, "passes-walls")) return PASSES_WALLS;
    if (!strcmp(name, "slow-digestion")) return SLOW_DIGESTION;
    if (!strcmp(name, "regeneration")) return REGENERATION;
    if (!strcmp(name, "energy-regeneration")) return ENERGY_REGENERATION;
    if (!strcmp(name, "protection-from-shape-changers"))
        return PROT_FROM_SHAPE_CHANGERS;
    if (!strcmp(name, "speed")) return FAST;
    if (!strcmp(name, "reflection")) return REFLECTING;
    if (!strcmp(name, "free-action")) return FREE_ACTION;
    return 0;
}

staticfn int
electron_test_terrain_type_from_string(const char *type_id, int *door_mask, int *trap)
{
    *door_mask = 0;
    *trap = NO_TRAP;
    if (!strcmp(type_id, "floor")) return ROOM;
    if (!strcmp(type_id, "room")) return ROOM;
    if (!strcmp(type_id, "corridor")) return CORR;
    if (!strcmp(type_id, "stone")) return STONE;
    if (!strcmp(type_id, "wall")) return VWALL;
    if (!strcmp(type_id, "wall-horizontal")) return HWALL;
    if (!strcmp(type_id, "wall-vertical")) return VWALL;
    if (!strcmp(type_id, "door-none") || !strcmp(type_id, "doorway")) { *door_mask = D_NODOOR; return DOOR; }
    if (!strcmp(type_id, "door-open")) { *door_mask = D_ISOPEN; return DOOR; }
    if (!strcmp(type_id, "door-closed")) { *door_mask = D_CLOSED; return DOOR; }
    if (!strcmp(type_id, "door-locked")) { *door_mask = D_CLOSED | D_LOCKED; return DOOR; }
    if (!strcmp(type_id, "stairs-up")) return STAIRS;
    if (!strcmp(type_id, "stairs-down")) return STAIRS;
    if (!strcmp(type_id, "ladder-up")) return LADDER;
    if (!strcmp(type_id, "ladder-down")) return LADDER;
    if (!strcmp(type_id, "fountain")) return FOUNTAIN;
    if (!strcmp(type_id, "sink")) return SINK;
    if (!strcmp(type_id, "water")) return POOL;
    if (!strcmp(type_id, "moat")) return MOAT;
    if (!strcmp(type_id, "lava")) return LAVAPOOL;
    if (!strcmp(type_id, "ice")) return ICE;
    if (!strcmp(type_id, "altar")) return ALTAR;
    if (!strcmp(type_id, "trap-pit")) { *trap = PIT; return ROOM; }
    if (!strcmp(type_id, "trap-bear")) { *trap = BEAR_TRAP; return ROOM; }
    if (!strcmp(type_id, "trap-web")) { *trap = WEB; return ROOM; }
    return INVALID_TYPE;
}

staticfn int
electron_test_trap_type_from_string(const char *type_id)
{
    if (!strcmp(type_id, "pit")) return PIT;
    if (!strcmp(type_id, "spiked-pit")) return SPIKED_PIT;
    if (!strcmp(type_id, "bear")) return BEAR_TRAP;
    if (!strcmp(type_id, "web")) return WEB;
    if (!strcmp(type_id, "landmine")) return LANDMINE;
    return NO_TRAP;
}

staticfn boolean
electron_test_is_container_type(int type_id)
{
    return type_id == CHEST || type_id == LARGE_BOX || type_id == SACK
           || type_id == BAG_OF_HOLDING;
}

staticfn boolean
electron_test_is_equippable_worn_type(int type_id)
{
    return objects[type_id].oc_class == ARMOR_CLASS
           || objects[type_id].oc_class == RING_CLASS
           || objects[type_id].oc_class == AMULET_CLASS;
}

staticfn void
electron_test_copy_fact(char *dst, const char *src, const char *id)
{
    size_t len = strlen(src);
    if (!len || len >= ELECTRON_TEST_FACT_LEN)
        electron_json_fail(id, "expectedPublicFacts value length is invalid");
    (void) strncpy(dst, src, ELECTRON_TEST_FACT_LEN - 1);
    dst[ELECTRON_TEST_FACT_LEN - 1] = '\0';
}

staticfn int
electron_test_alloc_object(struct electron_test_scenario_v1 *scenario)
{
    int idx;
    if (scenario->object_count >= ELECTRON_TEST_MAX_OBJECTS)
        electron_json_fail(scenario->id, "scenario declares too many objects");
    idx = scenario->object_count++;
    memset(&scenario->objects[idx], 0, sizeof scenario->objects[idx]);
    scenario->objects[idx].type_id = STRANGE_OBJECT;
    scenario->objects[idx].quantity = 1L;
    scenario->objects[idx].beatitude = ELECTRON_TEST_BEATITUDE_UNSET;
    scenario->objects[idx].equip_state = ELECTRON_TEST_EQUIP_NONE;
    scenario->objects[idx].corpse_monster_id = NON_PM;
    scenario->objects[idx].first_content = -1;
    return idx;
}

staticfn void
electron_test_parse_contents(const char **pp,
                             struct electron_test_scenario_v1 *scenario,
                             struct electron_test_object_spec *container)
{
    electron_json_expect_char(pp, '[', scenario->id, "expected container contents array");
    container->first_content = scenario->object_count;
    container->content_count = 0;
    if (electron_json_consume_char(pp, ']'))
        return;
    for (;;) {
        int child;
        if (container->content_count >= ELECTRON_TEST_MAX_GROUND)
            electron_json_fail(scenario->id, "container contents array is too large");
        child = electron_test_parse_object_spec(pp, scenario, FALSE, TRUE, FALSE);
        if (electron_test_is_container_type(scenario->objects[child].type_id))
            electron_json_fail(scenario->id, "nested containers are not supported");
        ++container->content_count;
        if (electron_json_consume_char(pp, ']'))
            break;
        electron_json_expect_char(pp, ',', scenario->id,
                                  "expected ',' between container contents");
    }
}

staticfn int
electron_test_parse_object_spec(const char **pp,
                                struct electron_test_scenario_v1 *scenario,
                                boolean allow_container,
                                boolean allow_identity_fields,
                                boolean allow_equipped)
{
    unsigned seen = 0U;
    int idx = electron_test_alloc_object(scenario);
    struct electron_test_object_spec *spec = &scenario->objects[idx];

    electron_json_expect_char(pp, '{', scenario->id, "expected object spec");
    if (electron_json_consume_char(pp, '}'))
        electron_json_fail(scenario->id, "object spec is missing typeId");
    for (;;) {
        char *key = electron_json_parse_string(pp, scenario->id);
        electron_json_expect_char(pp, ':', scenario->id,
                                  "expected ':' after object field");
        if (!strcmp(key, "typeId")) {
            char *type_id;
            electron_json_require_unique(&seen, 0x001U, scenario->id, key);
            type_id = electron_json_parse_string(pp, scenario->id);
            spec->type_id = electron_test_type_id_from_string(type_id);
            free(type_id);
            if (spec->type_id == STRANGE_OBJECT)
                electron_json_fail(scenario->id, "unsupported object typeId");
        } else if (!strcmp(key, "quantity")) {
            long quantity;
            electron_json_require_unique(&seen, 0x002U, scenario->id, key);
            quantity = electron_json_parse_int(pp, scenario->id);
            if (quantity < 1L || quantity > 99L)
                electron_json_fail(scenario->id, "object quantity is out of range");
            spec->quantity_present = TRUE;
            spec->quantity = quantity;
        } else if (!strcmp(key, "identityKnown")) {
            electron_json_require_unique(&seen, 0x004U, scenario->id, key);
            if (!allow_identity_fields)
                electron_json_fail(scenario->id,
                                   "identityKnown is not supported here");
            spec->identity_known_present = TRUE;
            spec->identity_known = electron_json_parse_bool(pp, scenario->id);
        } else if (!strcmp(key, "beatitudeKnown")) {
            electron_json_require_unique(&seen, 0x008U, scenario->id, key);
            if (!allow_identity_fields)
                electron_json_fail(scenario->id,
                                   "beatitudeKnown is not supported here");
            spec->beatitude_known_present = TRUE;
            spec->beatitude_known = electron_json_parse_bool(pp, scenario->id);
        } else if (!strcmp(key, "beatitude")) {
            char *value;
            electron_json_require_unique(&seen, 0x080U, scenario->id, key);
            value = electron_json_parse_string(pp, scenario->id);
            if (!strcmp(value, "blessed"))
                spec->beatitude = 1;
            else if (!strcmp(value, "uncursed"))
                spec->beatitude = 0;
            else if (!strcmp(value, "cursed"))
                spec->beatitude = -1;
            else {
                free(value);
                electron_json_fail(scenario->id, "unsupported object beatitude");
            }
            free(value);
        } else if (!strcmp(key, "charges")) {
            long value;
            electron_json_require_unique(&seen, 0x100U, scenario->id, key);
            value = electron_json_parse_int(pp, scenario->id);
            if (value < 0L || value > 99L)
                electron_json_fail(scenario->id, "object charges are out of range");
            spec->charges_present = TRUE;
            spec->charges = (int) value;
        } else if (!strcmp(key, "fuel")) {
            long value;
            electron_json_require_unique(&seen, 0x40000U, scenario->id, key);
            value = electron_json_parse_int(pp, scenario->id);
            if (value < 1L || value > 100000L)
                electron_json_fail(scenario->id, "object fuel is out of range");
            spec->fuel_present = TRUE;
            spec->fuel = value;
        } else if (!strcmp(key, "enchantment")) {
            long value;
            electron_json_require_unique(&seen, 0x200U, scenario->id, key);
            value = electron_json_parse_int(pp, scenario->id);
            if (value < -5L || value > 5L)
                electron_json_fail(scenario->id, "object enchantment is out of range");
            spec->enchantment_present = TRUE;
            spec->enchantment = (int) value;
        } else if (!strcmp(key, "erosion")) {
            long value;
            electron_json_require_unique(&seen, 0x400U, scenario->id, key);
            value = electron_json_parse_int(pp, scenario->id);
            if (value < 0L || value > 3L)
                electron_json_fail(scenario->id, "object erosion is out of range");
            spec->erosion_present = TRUE;
            spec->erosion = (int) value;
        } else if (!strcmp(key, "corrosion")) {
            long value;
            electron_json_require_unique(&seen, 0x800U, scenario->id, key);
            value = electron_json_parse_int(pp, scenario->id);
            if (value < 0L || value > 3L)
                electron_json_fail(scenario->id, "object corrosion is out of range");
            spec->corrosion_present = TRUE;
            spec->corrosion = (int) value;
        } else if (!strcmp(key, "poisoned")) {
            electron_json_require_unique(&seen, 0x1000U, scenario->id, key);
            spec->poisoned_present = TRUE;
            spec->poisoned = electron_json_parse_bool(pp, scenario->id);
        } else if (!strcmp(key, "calledName")) {
            char *value;
            electron_json_require_unique(&seen, 0x10000U, scenario->id, key);
            if (!allow_identity_fields)
                electron_json_fail(scenario->id, "calledName is not supported here");
            value = electron_json_parse_string(pp, scenario->id);
            if (!*value || strlen(value) >= sizeof spec->called_name) {
                free(value);
                electron_json_fail(scenario->id, "calledName length is invalid");
            }
            Strcpy(spec->called_name, value);
            spec->called_name_present = TRUE;
            free(value);
        } else if (!strcmp(key, "individualName")) {
            char *value;
            electron_json_require_unique(&seen, 0x20000U, scenario->id, key);
            if (!allow_identity_fields)
                electron_json_fail(scenario->id, "individualName is not supported here");
            value = electron_json_parse_string(pp, scenario->id);
            if (!*value || strlen(value) >= sizeof spec->individual_name) {
                free(value);
                electron_json_fail(scenario->id, "individualName length is invalid");
            }
            Strcpy(spec->individual_name, value);
            spec->individual_name_present = TRUE;
            free(value);
        } else if (!strcmp(key, "corpseMonsterTypeId")) {
            char *value;
            electron_json_require_unique(&seen, 0x8000U, scenario->id, key);
            value = electron_json_parse_string(pp, scenario->id);
            spec->corpse_monster_id = electron_test_monster_id_from_string(value);
            free(value);
            if (spec->corpse_monster_id == NON_PM)
                electron_json_fail(scenario->id, "unsupported corpseMonsterTypeId");
            spec->corpse_monster_present = TRUE;
        } else if (!strcmp(key, "equipped")) {
            char *value;
            electron_json_require_unique(&seen, 0x2000U, scenario->id, key);
            if (!allow_equipped)
                electron_json_fail(scenario->id, "equipped is only supported for inventory objects");
            value = electron_json_parse_string(pp, scenario->id);
            if (!strcmp(value, "none"))
                spec->equip_state = ELECTRON_TEST_EQUIP_NONE;
            else if (!strcmp(value, "wielded"))
                spec->equip_state = ELECTRON_TEST_EQUIP_WIELDED;
            else if (!strcmp(value, "worn"))
                spec->equip_state = ELECTRON_TEST_EQUIP_WORN;
            else if (!strcmp(value, "quivered"))
                spec->equip_state = ELECTRON_TEST_EQUIP_QUIVERED;
            else if (!strcmp(value, "left-ring"))
                spec->equip_state = ELECTRON_TEST_EQUIP_LEFT_RING;
            else if (!strcmp(value, "right-ring"))
                spec->equip_state = ELECTRON_TEST_EQUIP_RIGHT_RING;
            else {
                free(value);
                electron_json_fail(scenario->id, "unsupported equipped state");
            }
            free(value);
        } else if (!strcmp(key, "locked")) {
            electron_json_require_unique(&seen, 0x010U, scenario->id, key);
            spec->locked_present = TRUE;
            spec->locked = electron_json_parse_bool(pp, scenario->id);
        } else if (!strcmp(key, "lockKnown")) {
            electron_json_require_unique(&seen, 0x4000U, scenario->id, key);
            spec->lock_known_present = TRUE;
            spec->lock_known = electron_json_parse_bool(pp, scenario->id);
        } else if (!strcmp(key, "trap")) {
            char *trap;
            electron_json_require_unique(&seen, 0x020U, scenario->id, key);
            trap = electron_json_parse_string(pp, scenario->id);
            if (!strcmp(trap, "none"))
                spec->trapped = FALSE;
            else if (!strcmp(trap, "armed"))
                spec->trapped = TRUE;
            else {
                free(trap);
                electron_json_fail(scenario->id, "unsupported container trap value");
            }
            free(trap);
            spec->trap_present = TRUE;
        } else if (!strcmp(key, "contents")) {
            electron_json_require_unique(&seen, 0x040U, scenario->id, key);
            spec->contents_present = TRUE;
            electron_test_parse_contents(pp, scenario, spec);
        } else {
            free(key);
            electron_json_fail(scenario->id, "unsupported object spec field");
        }
        free(key);
        if (electron_json_consume_char(pp, '}'))
            break;
        electron_json_expect_char(pp, ',', scenario->id,
                                  "expected ',' between object fields");
    }
    if (!(seen & 0x001U))
        electron_json_fail(scenario->id, "object spec is missing typeId");
    if (spec->corpse_monster_present && spec->type_id != CORPSE)
        electron_json_fail(scenario->id, "corpseMonsterTypeId requires CORPSE typeId");
    if (spec->type_id == CORPSE && !spec->corpse_monster_present)
        electron_json_fail(scenario->id, "CORPSE object requires corpseMonsterTypeId");
    if (electron_test_is_container_type(spec->type_id)) {
        if (!allow_container)
            electron_json_fail(scenario->id, "container object is not supported here");
        if (spec->quantity_present && spec->quantity != 1L)
            electron_json_fail(scenario->id,
                               "container quantity must be omitted or 1");
        if (spec->identity_known_present || spec->beatitude_known_present
            || spec->beatitude != ELECTRON_TEST_BEATITUDE_UNSET)
            electron_json_fail(scenario->id,
                               "identityKnown/beatitudeKnown/beatitude are not supported for containers");
        if (spec->equip_state != ELECTRON_TEST_EQUIP_NONE)
            electron_json_fail(scenario->id,
                               "containers cannot be equipped");
        if (spec->charges_present || spec->enchantment_present
            || spec->erosion_present || spec->corrosion_present
            || spec->poisoned_present || spec->called_name_present
            || spec->individual_name_present)
            electron_json_fail(scenario->id,
                               "container object field is not supported");
        if (!spec->locked_present || !spec->trap_present || !spec->contents_present)
            electron_json_fail(scenario->id,
                               "container object is missing required fields");
    } else if (spec->locked_present || spec->lock_known_present || spec->trap_present || spec->contents_present) {
        electron_json_fail(scenario->id,
                           "locked/lockKnown/trap/contents require a container object");
    } else {
        int prior;
        if (spec->called_name_present && !OBJ_DESCR(objects[spec->type_id]))
            electron_json_fail(scenario->id,
                               "calledName requires an object type with a public appearance");
        if (spec->individual_name_present && spec->quantity != 1L)
            electron_json_fail(scenario->id,
                               "individualName requires object quantity 1");
        for (prior = 0; prior < idx; ++prior) {
            const struct electron_test_object_spec *other = &scenario->objects[prior];
            if (other->type_id != spec->type_id
                || (!other->called_name_present && !spec->called_name_present))
                continue;
            if (other->called_name_present != spec->called_name_present
                || strcmp(other->called_name, spec->called_name))
                electron_json_fail(scenario->id,
                                   "all fixture objects of one type must share the same calledName");
        }
        if (spec->charges_present && !objects[spec->type_id].oc_charged
            && spec->type_id != BELL_OF_OPENING
            && spec->type_id != CANDELABRUM_OF_INVOCATION)
            electron_json_fail(scenario->id,
                               "charges are not supported for this object type");
        if (spec->fuel_present
            && spec->type_id != CANDELABRUM_OF_INVOCATION)
            electron_json_fail(scenario->id,
                               "fuel is only supported for the Candelabrum of Invocation");
        if (spec->enchantment_present) {
            struct obj tmpobj;
            memset(&tmpobj, 0, sizeof tmpobj);
            tmpobj.otyp = spec->type_id;
            tmpobj.oclass = objects[spec->type_id].oc_class;
            if (objects[spec->type_id].oc_class != WEAPON_CLASS
                && objects[spec->type_id].oc_class != ARMOR_CLASS
                && objects[spec->type_id].oc_class != RING_CLASS
                && !is_weptool(&tmpobj))
                electron_json_fail(scenario->id,
                                   "enchantment is not supported for this object type");
        }
        if ((spec->erosion_present || spec->corrosion_present)
            && objects[spec->type_id].oc_class != WEAPON_CLASS
            && objects[spec->type_id].oc_class != ARMOR_CLASS)
            electron_json_fail(scenario->id,
                               "erosion/corrosion require weapon or armor objects");
        if (spec->poisoned_present) {
            struct obj tmpobj;
            memset(&tmpobj, 0, sizeof tmpobj);
            tmpobj.otyp = spec->type_id;
            tmpobj.oclass = objects[spec->type_id].oc_class;
            {
                struct obj *tmpobjp = &tmpobj;
                if (!is_poisonable(tmpobjp))
                    electron_json_fail(scenario->id,
                                       "poisoned requires a poisonable weapon");
            }
        }
        if (spec->equip_state == ELECTRON_TEST_EQUIP_WIELDED) {
            struct obj tmpobj;
            memset(&tmpobj, 0, sizeof tmpobj);
            tmpobj.otyp = spec->type_id;
            tmpobj.oclass = objects[spec->type_id].oc_class;
            if (objects[spec->type_id].oc_class != WEAPON_CLASS
                && !is_weptool(&tmpobj))
                electron_json_fail(scenario->id,
                                   "wielded requires weapon or weapon-tool object");
        }
        if ((spec->equip_state == ELECTRON_TEST_EQUIP_WORN
             || spec->equip_state == ELECTRON_TEST_EQUIP_LEFT_RING
             || spec->equip_state == ELECTRON_TEST_EQUIP_RIGHT_RING)
            && !electron_test_is_equippable_worn_type(spec->type_id))
            electron_json_fail(scenario->id,
                               "worn equipment state requires wearable object");
        if ((spec->equip_state == ELECTRON_TEST_EQUIP_LEFT_RING
             || spec->equip_state == ELECTRON_TEST_EQUIP_RIGHT_RING)
            && objects[spec->type_id].oc_class != RING_CLASS)
            electron_json_fail(scenario->id,
                               "left-ring/right-ring equipped state requires a ring");
        if (spec->equip_state == ELECTRON_TEST_EQUIP_QUIVERED
            && objects[spec->type_id].oc_class != WEAPON_CLASS)
            electron_json_fail(scenario->id,
                               "quivered requires weapon/ammunition object");
    }
    return idx;
}

staticfn void
electron_test_parse_location(const char **pp,
                             struct electron_test_scenario_v1 *scenario,
                             struct electron_test_location_spec *loc)
{
    memset(loc, 0, sizeof *loc);
    if (electron_json_peek_char(pp, '"')) {
        char *value = electron_json_parse_string(pp, scenario->id);
        if (!strcmp(value, "hero")) {
            loc->dx = 0; loc->dy = 0;
        } else if (!strcmp(value, "north")) {
            loc->dx = 0; loc->dy = -1;
        } else if (!strcmp(value, "south")) {
            loc->dx = 0; loc->dy = 1;
        } else if (!strcmp(value, "east")) {
            loc->dx = 1; loc->dy = 0;
        } else if (!strcmp(value, "west")) {
            loc->dx = -1; loc->dy = 0;
        } else if (!strcmp(value, "northeast")) {
            loc->dx = 1; loc->dy = -1;
        } else if (!strcmp(value, "northwest")) {
            loc->dx = -1; loc->dy = -1;
        } else if (!strcmp(value, "southeast")) {
            loc->dx = 1; loc->dy = 1;
        } else if (!strcmp(value, "southwest")) {
            loc->dx = -1; loc->dy = 1;
        } else {
            free(value);
            electron_json_fail(scenario->id, "unsupported object location");
        }
        free(value);
        return;
    }
    electron_json_expect_char(pp, '{', scenario->id, "expected location object or string");
    if (electron_json_consume_char(pp, '}'))
        electron_json_fail(scenario->id, "location object cannot be empty");
    {
        unsigned seen = 0U;
        for (;;) {
            char *key = electron_json_parse_string(pp, scenario->id);
            electron_json_expect_char(pp, ':', scenario->id,
                                      "expected ':' after location field");
            if (!strcmp(key, "dx")) {
                long value;
                electron_json_require_unique(&seen, 0x01U, scenario->id, key);
                value = electron_json_parse_int(pp, scenario->id);
                if (value < -20L || value > 20L)
                    electron_json_fail(scenario->id, "location dx is out of range");
                loc->dx = (int) value;
            } else if (!strcmp(key, "dy")) {
                long value;
                electron_json_require_unique(&seen, 0x02U, scenario->id, key);
                value = electron_json_parse_int(pp, scenario->id);
                if (value < -20L || value > 20L)
                    electron_json_fail(scenario->id, "location dy is out of range");
                loc->dy = (int) value;
            } else if (!strcmp(key, "x")) {
                long value;
                electron_json_require_unique(&seen, 0x04U, scenario->id, key);
                value = electron_json_parse_int(pp, scenario->id);
                if (value < 1L || value >= COLNO - 1)
                    electron_json_fail(scenario->id, "location x is out of bounds");
                loc->x = (int) value;
                loc->absolute = TRUE;
            } else if (!strcmp(key, "y")) {
                long value;
                electron_json_require_unique(&seen, 0x08U, scenario->id, key);
                value = electron_json_parse_int(pp, scenario->id);
                if (value < 0L || value >= ROWNO)
                    electron_json_fail(scenario->id, "location y is out of bounds");
                loc->y = (int) value;
                loc->absolute = TRUE;
            } else {
                free(key);
                electron_json_fail(scenario->id, "unsupported location field");
            }
            free(key);
            if (electron_json_consume_char(pp, '}'))
                break;
            electron_json_expect_char(pp, ',', scenario->id,
                                      "expected ',' between location fields");
        }
        if (loc->absolute) {
            if ((seen & 0x0CU) != 0x0CU || (seen & 0x03U))
                electron_json_fail(scenario->id,
                                   "absolute location requires x/y only");
        } else if ((seen & 0x03U) != 0x03U) {
            electron_json_fail(scenario->id,
                               "relative location requires dx/dy");
        }
    }
}

staticfn void
electron_test_parse_ground_entry(const char **pp,
                                 struct electron_test_scenario_v1 *scenario)
{
    unsigned seen = 0U;
    struct electron_test_ground_spec *ground;

    if (scenario->ground_count >= ELECTRON_TEST_MAX_GROUND)
        electron_json_fail(scenario->id, "ground array is too large");
    ground = &scenario->ground[scenario->ground_count];
    memset(ground, 0, sizeof *ground);
    ground->object_index = -1;
    electron_json_expect_char(pp, '{', scenario->id, "expected ground entry");
    if (electron_json_consume_char(pp, '}'))
        electron_json_fail(scenario->id, "ground entry cannot be empty");
    for (;;) {
        char *key = electron_json_parse_string(pp, scenario->id);
        electron_json_expect_char(pp, ':', scenario->id,
                                  "expected ':' after ground entry field");
        if (!strcmp(key, "at")) {
            electron_json_require_unique(&seen, 0x01U, scenario->id, key);
            electron_test_parse_location(pp, scenario, &ground->loc);
        } else if (!strcmp(key, "object")) {
            electron_json_require_unique(&seen, 0x02U, scenario->id, key);
            ground->object_index = electron_test_parse_object_spec(pp, scenario,
                                                                   TRUE, TRUE, FALSE);
        } else {
            free(key);
            electron_json_fail(scenario->id, "unsupported ground entry field");
        }
        free(key);
        if (electron_json_consume_char(pp, '}'))
            break;
        electron_json_expect_char(pp, ',', scenario->id,
                                  "expected ',' between ground entry fields");
    }
    if ((seen & 0x03U) != 0x03U)
        electron_json_fail(scenario->id, "ground entry is missing required fields");
    ++scenario->ground_count;
}

staticfn void
electron_test_parse_ground(const char **pp,
                           struct electron_test_scenario_v1 *scenario)
{
    electron_json_expect_char(pp, '[', scenario->id, "expected ground array");
    if (electron_json_consume_char(pp, ']'))
        return;
    for (;;) {
        electron_test_parse_ground_entry(pp, scenario);
        if (electron_json_consume_char(pp, ']'))
            break;
        electron_json_expect_char(pp, ',', scenario->id,
                                  "expected ',' between ground entries");
    }
}

staticfn void
electron_test_parse_inventory(const char **pp,
                              struct electron_test_scenario_v1 *scenario)
{
    electron_json_expect_char(pp, '[', scenario->id, "expected inventory array");
    if (electron_json_consume_char(pp, ']'))
        return;
    for (;;) {
        if (scenario->inventory_count >= ELECTRON_TEST_MAX_INVENTORY)
            electron_json_fail(scenario->id, "inventory array is too large");
        scenario->inventory[scenario->inventory_count++] =
            electron_test_parse_object_spec(pp, scenario, FALSE, TRUE, TRUE);
        if (electron_json_consume_char(pp, ']'))
            break;
        electron_json_expect_char(pp, ',', scenario->id,
                                  "expected ',' between inventory entries");
    }
}

staticfn void
electron_test_parse_hero(const char **pp,
                         struct electron_test_scenario_v1 *scenario)
{
    unsigned seen = 0U;
    electron_json_expect_char(pp, '{', scenario->id, "expected hero object");
    if (electron_json_consume_char(pp, '}'))
        electron_json_fail(scenario->id, "hero object cannot be empty");
    for (;;) {
        char *key = electron_json_parse_string(pp, scenario->id);
        electron_json_expect_char(pp, ':', scenario->id,
                                  "expected ':' after hero field");
        if (!strcmp(key, "placement")) {
            char *value;
            electron_json_require_unique(&seen, 0x001U, scenario->id, key);
            value = electron_json_parse_string(pp, scenario->id);
            if (!strcmp(value, "current"))
                scenario->hero_placement = ELECTRON_TEST_HERO_CURRENT;
            else if (!strcmp(value, "nearest-safe-floor"))
                scenario->hero_placement = ELECTRON_TEST_HERO_NEAREST_SAFE_FLOOR;
            else if (!strcmp(value, "near-monster"))
                scenario->hero_placement = ELECTRON_TEST_HERO_NEAR_MONSTER;
            else if (!strcmp(value, "near-object"))
                scenario->hero_placement = ELECTRON_TEST_HERO_NEAR_OBJECT;
            else if (!strcmp(value, "near-terrain"))
                scenario->hero_placement = ELECTRON_TEST_HERO_NEAR_TERRAIN;
            else if (!strcmp(value, "on-terrain"))
                scenario->hero_placement = ELECTRON_TEST_HERO_ON_TERRAIN;
            else if (!strcmp(value, "on-invocation-position"))
                scenario->hero_placement =
                    ELECTRON_TEST_HERO_ON_INVOCATION_POSITION;
            else {
                free(value);
                electron_json_fail(scenario->id, "unsupported hero placement");
            }
            free(value);
        } else if (!strcmp(key, "placementTarget")) {
            char *value;
            int door_mask, trap;
            electron_json_require_unique(&seen, 0x002U, scenario->id, key);
            value = electron_json_parse_string(pp, scenario->id);
            if (scenario->hero_placement == ELECTRON_TEST_HERO_NEAR_MONSTER)
                scenario->hero_placement_target =
                    electron_test_monster_id_from_string(value);
            else if (scenario->hero_placement == ELECTRON_TEST_HERO_NEAR_OBJECT)
                scenario->hero_placement_target =
                    electron_test_type_id_from_string(value);
            else if (scenario->hero_placement == ELECTRON_TEST_HERO_NEAR_TERRAIN
                     || scenario->hero_placement == ELECTRON_TEST_HERO_ON_TERRAIN)
                scenario->hero_placement_target =
                    electron_test_terrain_type_from_string(value, &door_mask, &trap);
            else {
                free(value);
                electron_json_fail(scenario->id,
                                   "placementTarget requires a targeted hero placement");
            }
            free(value);
            if (scenario->hero_placement_target == NON_PM
                || scenario->hero_placement_target == STRANGE_OBJECT
                || scenario->hero_placement_target == INVALID_TYPE)
                electron_json_fail(scenario->id, "unsupported hero placementTarget");
        } else if (!strcmp(key, "placementDistance")) {
            long value;
            electron_json_require_unique(&seen, 0x004U, scenario->id, key);
            value = electron_json_parse_int(pp, scenario->id);
            if (value < 1L || value > 8L)
                electron_json_fail(scenario->id,
                                   "hero placementDistance is out of range");
            scenario->hero_placement_distance = (int) value;
        } else if (!strcmp(key, "role")) {
            char *value;
            electron_json_require_unique(&seen, 0x008U, scenario->id, key);
            value = electron_json_parse_string(pp, scenario->id);
            scenario->role = str2role(value);
            free(value);
            if (!validrole(scenario->role))
                electron_json_fail(scenario->id, "unsupported or invalid hero role");
            scenario->role_present = TRUE;
        } else if (!strcmp(key, "race")) {
            char *value;
            electron_json_require_unique(&seen, 0x010U, scenario->id, key);
            value = electron_json_parse_string(pp, scenario->id);
            scenario->race = str2race(value);
            free(value);
            if (scenario->race < 0)
                electron_json_fail(scenario->id, "unsupported or invalid hero race");
            scenario->race_present = TRUE;
        } else if (!strcmp(key, "gender") || !strcmp(key, "sex")) {
            char *value;
            electron_json_require_unique(&seen, 0x020U, scenario->id, key);
            value = electron_json_parse_string(pp, scenario->id);
            scenario->gender = str2gend(value);
            free(value);
            if (scenario->gender < 0)
                electron_json_fail(scenario->id, "unsupported or invalid hero gender");
            scenario->gender_present = TRUE;
        } else if (!strcmp(key, "alignment")) {
            char *value;
            electron_json_require_unique(&seen, 0x040U, scenario->id, key);
            value = electron_json_parse_string(pp, scenario->id);
            scenario->alignment = str2align(value);
            free(value);
            if (scenario->alignment < 0)
                electron_json_fail(scenario->id, "unsupported or invalid hero alignment");
            scenario->alignment_present = TRUE;
        } else if (!strcmp(key, "alignmentRecord")) {
            long value;
            electron_json_require_unique(&seen, 0x8000U, scenario->id, key);
            value = electron_json_parse_int(pp, scenario->id);
            if (value < -100L || value > 100L)
                electron_json_fail(scenario->id,
                                   "hero alignmentRecord is out of range");
            scenario->alignment_record_present = TRUE;
            scenario->alignment_record = (int) value;
        } else if (!strcmp(key, "experienceLevel")) {
            long value;
            electron_json_require_unique(&seen, 0x080U, scenario->id, key);
            value = electron_json_parse_int(pp, scenario->id);
            if (value < 1L || value > MAXULEV)
                electron_json_fail(scenario->id, "hero experienceLevel is out of range");
            scenario->experience_level_present = TRUE;
            scenario->experience_level = (int) value;
        } else if (!strcmp(key, "hp")) {
            long value;
            electron_json_require_unique(&seen, 0x100U, scenario->id, key);
            value = electron_json_parse_int(pp, scenario->id);
            if (value < 1L || value > 9999L)
                electron_json_fail(scenario->id, "hero hp is out of range");
            scenario->hp_present = TRUE;
            scenario->hp = (int) value;
        } else if (!strcmp(key, "maxHp")) {
            long value;
            electron_json_require_unique(&seen, 0x200U, scenario->id, key);
            value = electron_json_parse_int(pp, scenario->id);
            if (value < 1L || value > 9999L)
                electron_json_fail(scenario->id, "hero maxHp is out of range");
            scenario->maxhp = (int) value;
        } else if (!strcmp(key, "power")) {
            long value;
            electron_json_require_unique(&seen, 0x400U, scenario->id, key);
            value = electron_json_parse_int(pp, scenario->id);
            if (value < 0L || value > 9999L)
                electron_json_fail(scenario->id, "hero power is out of range");
            scenario->power_present = TRUE;
            scenario->power = (int) value;
        } else if (!strcmp(key, "maxPower")) {
            long value;
            electron_json_require_unique(&seen, 0x800U, scenario->id, key);
            value = electron_json_parse_int(pp, scenario->id);
            if (value < 0L || value > 9999L)
                electron_json_fail(scenario->id, "hero maxPower is out of range");
            scenario->maxpower = (int) value;
        } else if (!strcmp(key, "amuletWishComplete")) {
            electron_json_require_unique(&seen, 0x1000U, scenario->id, key);
            scenario->amulet_wish_complete =
                electron_json_parse_bool(pp, scenario->id);
        } else if (!strcmp(key, "wakePlacementTarget")) {
            electron_json_require_unique(&seen, 0x2000U, scenario->id, key);
            scenario->wake_placement_target =
                electron_json_parse_bool(pp, scenario->id);
        } else if (!strcmp(key, "intrinsics")) {
            electron_json_require_unique(&seen, 0x4000U, scenario->id, key);
            electron_json_expect_char(pp, '[', scenario->id,
                                      "expected intrinsics array");
            if (!electron_json_consume_char(pp, ']')) {
                for (;;) {
                    char *value;
                    int property;
                    if (scenario->intrinsic_count
                        >= ELECTRON_TEST_MAX_INTRINSICS)
                        electron_json_fail(scenario->id,
                                           "hero intrinsics array is too large");
                    value = electron_json_parse_string(pp, scenario->id);
                    property = electron_test_property_from_string(value);
                    free(value);
                    if (!property)
                        electron_json_fail(scenario->id,
                                           "unsupported hero intrinsic");
                    scenario->intrinsics[scenario->intrinsic_count++] =
                        property;
                    if (electron_json_consume_char(pp, ']'))
                        break;
                    electron_json_expect_char(pp, ',', scenario->id,
                                              "expected ',' between intrinsics");
                }
            }
        } else {
            free(key);
            electron_json_fail(scenario->id, "unsupported hero field");
        }
        free(key);
        if (electron_json_consume_char(pp, '}'))
            break;
        electron_json_expect_char(pp, ',', scenario->id,
                                  "expected ',' between hero fields");
    }
    if ((seen & (0x002U | 0x004U | 0x080U | 0x100U | 0x200U
                 | 0x400U | 0x800U | 0x1000U | 0x2000U | 0x4000U
                 | 0x8000U)) != 0U
        || scenario->hero_placement >= ELECTRON_TEST_HERO_NEAR_MONSTER)
        scenario->v2_fields_present = TRUE;
    if ((scenario->hero_placement == ELECTRON_TEST_HERO_NEAR_MONSTER
         || scenario->hero_placement == ELECTRON_TEST_HERO_NEAR_OBJECT
         || scenario->hero_placement == ELECTRON_TEST_HERO_NEAR_TERRAIN
         || scenario->hero_placement == ELECTRON_TEST_HERO_ON_TERRAIN)
        && !(seen & 0x002U))
        electron_json_fail(scenario->id,
                           "targeted hero placement requires placementTarget");
    if (scenario->wake_placement_target
        && scenario->hero_placement != ELECTRON_TEST_HERO_NEAR_MONSTER)
        electron_json_fail(scenario->id,
                           "wakePlacementTarget requires near-monster placement");
    if (scenario->hp_present && (!scenario->maxhp || scenario->hp > scenario->maxhp))
        electron_json_fail(scenario->id, "hero hp requires maxHp >= hp");
    if (scenario->power_present
        && (!(seen & 0x800U) || scenario->power > scenario->maxpower))
        electron_json_fail(scenario->id, "hero power requires maxPower >= power");
    if (scenario->role_present && scenario->race_present
        && !validrace(scenario->role, scenario->race))
        electron_json_fail(scenario->id, "invalid hero role/race combination");
    if (scenario->role_present && scenario->race_present
        && scenario->gender_present
        && !validgend(scenario->role, scenario->race, scenario->gender))
        electron_json_fail(scenario->id, "invalid hero role/race/gender combination");
    if (scenario->role_present && scenario->race_present
        && scenario->alignment_present
        && !validalign(scenario->role, scenario->race, scenario->alignment))
        electron_json_fail(scenario->id, "invalid hero role/race/alignment combination");
}

staticfn void
electron_test_parse_terrain_entry(const char **pp,
                                  struct electron_test_scenario_v1 *scenario)
{
    unsigned seen = 0U;
    struct electron_test_terrain_spec *terrain;
    if (scenario->terrain_count >= ELECTRON_TEST_MAX_TERRAIN)
        electron_json_fail(scenario->id, "terrain array is too large");
    terrain = &scenario->terrain[scenario->terrain_count];
    memset(terrain, 0, sizeof *terrain);
    terrain->typ = INVALID_TYPE;
    terrain->trap = NO_TRAP;
    terrain->stair_down = -1;
    electron_json_expect_char(pp, '{', scenario->id, "expected terrain entry");
    if (electron_json_consume_char(pp, '}'))
        electron_json_fail(scenario->id, "terrain entry cannot be empty");
    for (;;) {
        char *key = electron_json_parse_string(pp, scenario->id);
        electron_json_expect_char(pp, ':', scenario->id,
                                  "expected ':' after terrain field");
        if (!strcmp(key, "at")) {
            electron_json_require_unique(&seen, 0x01U, scenario->id, key);
            electron_test_parse_location(pp, scenario, &terrain->loc);
        } else if (!strcmp(key, "type")) {
            char *value;
            electron_json_require_unique(&seen, 0x02U, scenario->id, key);
            value = electron_json_parse_string(pp, scenario->id);
            terrain->typ = electron_test_terrain_type_from_string(value,
                &terrain->door_mask, &terrain->trap);
            if (terrain->typ == STAIRS || terrain->typ == LADDER)
                terrain->stair_down = (!strcmp(value, "stairs-down") || !strcmp(value, "ladder-down")) ? 1 : 0;
            free(value);
            if (terrain->typ == INVALID_TYPE)
                electron_json_fail(scenario->id, "unsupported terrain type");
        } else if (!strcmp(key, "trap")) {
            char *value;
            electron_json_require_unique(&seen, 0x04U, scenario->id, key);
            value = electron_json_parse_string(pp, scenario->id);
            terrain->trap = electron_test_trap_type_from_string(value);
            free(value);
            if (terrain->trap == NO_TRAP)
                electron_json_fail(scenario->id, "unsupported trap type");
        } else {
            free(key);
            electron_json_fail(scenario->id, "unsupported terrain field");
        }
        free(key);
        if (electron_json_consume_char(pp, '}'))
            break;
        electron_json_expect_char(pp, ',', scenario->id,
                                  "expected ',' between terrain fields");
    }
    if ((seen & 0x03U) != 0x03U)
        electron_json_fail(scenario->id, "terrain entry is missing required fields");
    ++scenario->terrain_count;
}

staticfn void
electron_test_parse_terrain_array(const char **pp,
                                  struct electron_test_scenario_v1 *scenario)
{
    electron_json_expect_char(pp, '[', scenario->id, "expected terrain array");
    if (electron_json_consume_char(pp, ']'))
        return;
    for (;;) {
        electron_test_parse_terrain_entry(pp, scenario);
        if (electron_json_consume_char(pp, ']'))
            break;
        electron_json_expect_char(pp, ',', scenario->id,
                                  "expected ',' between terrain entries");
    }
}

staticfn void
electron_test_parse_map(const char **pp,
                        struct electron_test_scenario_v1 *scenario)
{
    unsigned seen = 0U;
    struct electron_test_map_spec *map = &scenario->map;
    memset(map, 0, sizeof *map);
    electron_json_expect_char(pp, '{', scenario->id, "expected map object");
    if (electron_json_consume_char(pp, '}'))
        electron_json_fail(scenario->id, "map object cannot be empty");
    for (;;) {
        char *key = electron_json_parse_string(pp, scenario->id);
        electron_json_expect_char(pp, ':', scenario->id,
                                  "expected ':' after map field");
        if (!strcmp(key, "topLeft")) {
            electron_json_require_unique(&seen, 0x01U, scenario->id, key);
            electron_test_parse_location(pp, scenario, &map->top_left);
        } else if (!strcmp(key, "rows")) {
            electron_json_require_unique(&seen, 0x02U, scenario->id, key);
            electron_json_expect_char(pp, '[', scenario->id, "expected map rows array");
            if (electron_json_consume_char(pp, ']'))
                electron_json_fail(scenario->id, "map rows cannot be empty");
            for (;;) {
                char *row = electron_json_parse_string(pp, scenario->id);
                size_t len = strlen(row);
                if (map->row_count >= ELECTRON_TEST_MAX_MAP_ROWS)
                    electron_json_fail(scenario->id, "map has too many rows");
                if (!len || len > ELECTRON_TEST_MAX_MAP_COLS)
                    electron_json_fail(scenario->id, "map row width is invalid");
                if (map->row_count && (int) len != map->col_count)
                    electron_json_fail(scenario->id, "map rows must have equal width");
                {
                    size_t k;
                    for (k = 0; k < len; ++k) {
                        if (!strchr(".#|-+/< >^~L@", row[k]))
                            electron_json_fail(scenario->id,
                                               "unsupported map terrain symbol");
                    }
                }
                map->col_count = (int) len;
                (void) strncpy(map->rows[map->row_count], row,
                               ELECTRON_TEST_MAX_MAP_COLS);
                map->rows[map->row_count][ELECTRON_TEST_MAX_MAP_COLS] = '\0';
                ++map->row_count;
                free(row);
                if (electron_json_consume_char(pp, ']'))
                    break;
                electron_json_expect_char(pp, ',', scenario->id,
                                          "expected ',' between map rows");
            }
        } else {
            free(key);
            electron_json_fail(scenario->id, "unsupported map field");
        }
        free(key);
        if (electron_json_consume_char(pp, '}'))
            break;
        electron_json_expect_char(pp, ',', scenario->id,
                                  "expected ',' between map fields");
    }
    if ((seen & 0x03U) != 0x03U)
        electron_json_fail(scenario->id, "map object is missing required fields");
    map->present = TRUE;
}

staticfn void
electron_test_parse_level(const char **pp,
                          struct electron_test_scenario_v1 *scenario)
{
    unsigned seen = 0U;
    long safe_area;
    electron_json_expect_char(pp, '{', scenario->id, "expected level object");
    if (electron_json_consume_char(pp, '}'))
        electron_json_fail(scenario->id, "level object cannot be empty");
    for (;;) {
        char *key = electron_json_parse_string(pp, scenario->id);
        electron_json_expect_char(pp, ':', scenario->id,
                                  "expected ':' after level field");
        if (!strcmp(key, "safeAreaAroundHero")) {
            electron_json_require_unique(&seen, 0x01U, scenario->id, key);
            safe_area = electron_json_parse_int(pp, scenario->id);
            if (safe_area < 0L || safe_area > 10L)
                electron_json_fail(scenario->id,
                                   "safeAreaAroundHero is out of range");
            scenario->safe_area = (int) safe_area;
        } else if (!strcmp(key, "lit")) {
            electron_json_require_unique(&seen, 0x02U, scenario->id, key);
            scenario->level_lit = electron_json_parse_bool(pp, scenario->id);
        } else if (!strcmp(key, "suppressAdjacentMonsters")) {
            electron_json_require_unique(&seen, 0x04U, scenario->id, key);
            scenario->suppress_adjacent_monsters =
                electron_json_parse_bool(pp, scenario->id);
        } else if (!strcmp(key, "pet")) {
            char *value;
            electron_json_require_unique(&seen, 0x08U, scenario->id, key);
            value = electron_json_parse_string(pp, scenario->id);
            if (!strcmp(value, "none"))
                scenario->pet_none = TRUE;
            else if (!strcmp(value, "keep"))
                scenario->pet_none = FALSE;
            else {
                free(value);
                electron_json_fail(scenario->id, "unsupported pet mode");
            }
            free(value);
        } else if (!strcmp(key, "terrain")) {
            electron_json_require_unique(&seen, 0x10U, scenario->id, key);
            electron_test_parse_terrain_array(pp, scenario);
        } else if (!strcmp(key, "map")) {
            electron_json_require_unique(&seen, 0x20U, scenario->id, key);
            electron_test_parse_map(pp, scenario);
        } else if (!strcmp(key, "specialLevel")) {
            char *value;
            electron_json_require_unique(&seen, 0x40U, scenario->id, key);
            value = electron_json_parse_string(pp, scenario->id);
            if (strcmp(value, "soko1") && strcmp(value, "medusa")
                && strcmp(value, "castle") && strcmp(value, "valley")
                && strcmp(value, "juiblex") && strcmp(value, "baalz")
                && strcmp(value, "asmodeus") && strcmp(value, "orcus")
                && strcmp(value, "wizard1") && strcmp(value, "wizard2")
                && strcmp(value, "wizard3") && strcmp(value, "sanctum")
                && strcmp(value, "earth") && strcmp(value, "air")
                && strcmp(value, "fire") && strcmp(value, "water")
                && strcmp(value, "astral") && strcmp(value, "knox")
                && strcmp(value, "minend") && strcmp(value, "invocation")
                && strcmp(value, "x-strt") && strcmp(value, "x-loca")
                && strcmp(value, "x-goal")) {
                free(value);
                electron_json_fail(scenario->id,
                                   "unsupported specialLevel");
            }
            (void) strncpy(scenario->special_level, value,
                           sizeof scenario->special_level - 1);
            scenario->special_level[sizeof scenario->special_level - 1] = '\0';
            scenario->special_level_present = TRUE;
            free(value);
            scenario->v2_fields_present = TRUE;
        } else {
            free(key);
            electron_json_fail(scenario->id, "unsupported level field");
        }
        free(key);
        if (electron_json_consume_char(pp, '}'))
            break;
        electron_json_expect_char(pp, ',', scenario->id,
                                  "expected ',' between level fields");
    }
    if ((seen & 0x0FU) != 0x0FU)
        electron_json_fail(scenario->id, "level object is missing required v1 fields");
}

staticfn void
electron_test_parse_monster_entry(const char **pp,
                                  struct electron_test_scenario_v1 *scenario)
{
    unsigned seen = 0U;
    struct electron_test_monster_spec *mon;
    if (scenario->monster_count >= ELECTRON_TEST_MAX_MONSTERS)
        electron_json_fail(scenario->id, "monsters array is too large");
    mon = &scenario->monsters[scenario->monster_count];
    memset(mon, 0, sizeof *mon);
    mon->monster_id = NON_PM;
    mon->attitude = 0;
    electron_json_expect_char(pp, '{', scenario->id, "expected monster entry");
    if (electron_json_consume_char(pp, '}'))
        electron_json_fail(scenario->id, "monster entry cannot be empty");
    for (;;) {
        char *key = electron_json_parse_string(pp, scenario->id);
        electron_json_expect_char(pp, ':', scenario->id,
                                  "expected ':' after monster field");
        if (!strcmp(key, "typeId")) {
            char *value;
            electron_json_require_unique(&seen, 0x01U, scenario->id, key);
            value = electron_json_parse_string(pp, scenario->id);
            mon->monster_id = electron_test_monster_id_from_string(value);
            free(value);
            if (mon->monster_id == NON_PM)
                electron_json_fail(scenario->id, "unsupported monster typeId");
        } else if (!strcmp(key, "at")) {
            electron_json_require_unique(&seen, 0x02U, scenario->id, key);
            electron_test_parse_location(pp, scenario, &mon->loc);
        } else if (!strcmp(key, "attitude")) {
            char *value;
            electron_json_require_unique(&seen, 0x04U, scenario->id, key);
            value = electron_json_parse_string(pp, scenario->id);
            if (!strcmp(value, "hostile")) mon->attitude = 0;
            else if (!strcmp(value, "peaceful")) mon->attitude = 1;
            else if (!strcmp(value, "tame")) mon->attitude = 2;
            else {
                free(value);
                electron_json_fail(scenario->id, "unsupported monster attitude");
            }
            free(value);
        } else if (!strcmp(key, "asleep")) {
            electron_json_require_unique(&seen, 0x08U, scenario->id, key);
            mon->asleep_present = TRUE;
            mon->asleep = electron_json_parse_bool(pp, scenario->id);
        } else if (!strcmp(key, "hp")) {
            long value;
            electron_json_require_unique(&seen, 0x10U, scenario->id, key);
            value = electron_json_parse_int(pp, scenario->id);
            if (value < 1L || value > 500L)
                electron_json_fail(scenario->id, "monster hp is out of range");
            mon->hp_present = TRUE;
            mon->hp = (int) value;
        } else if (!strcmp(key, "maxHp")) {
            long value;
            electron_json_require_unique(&seen, 0x20U, scenario->id, key);
            value = electron_json_parse_int(pp, scenario->id);
            if (value < 1L || value > 500L)
                electron_json_fail(scenario->id, "monster maxHp is out of range");
            mon->maxhp = (int) value;
        } else {
            free(key);
            electron_json_fail(scenario->id, "unsupported monster field");
        }
        free(key);
        if (electron_json_consume_char(pp, '}'))
            break;
        electron_json_expect_char(pp, ',', scenario->id,
                                  "expected ',' between monster fields");
    }
    if ((seen & 0x03U) != 0x03U)
        electron_json_fail(scenario->id, "monster entry is missing required fields");
    if (mon->maxhp && mon->hp_present && mon->hp > mon->maxhp)
        electron_json_fail(scenario->id, "monster hp cannot exceed maxHp");
    ++scenario->monster_count;
}

staticfn void
electron_test_parse_monsters(const char **pp,
                             struct electron_test_scenario_v1 *scenario)
{
    electron_json_expect_char(pp, '[', scenario->id, "expected monsters array");
    if (electron_json_consume_char(pp, ']'))
        return;
    for (;;) {
        electron_test_parse_monster_entry(pp, scenario);
        if (electron_json_consume_char(pp, ']'))
            break;
        electron_json_expect_char(pp, ',', scenario->id,
                                  "expected ',' between monster entries");
    }
}

staticfn void
electron_test_parse_string_array(const char **pp,
                                 struct electron_test_scenario_v1 *scenario,
                                 const char *field,
                                 struct electron_test_expected_list *list)
{
    electron_json_expect_char(pp, '[', scenario->id,
                              "expected expectedPublicFacts array");
    if (electron_json_consume_char(pp, ']'))
        electron_json_fail(scenario->id,
                           "expectedPublicFacts arrays cannot be empty");
    list->count = 0;
    for (;;) {
        char *value = electron_json_parse_string(pp, scenario->id);
        int i;
        if (list->count >= ELECTRON_TEST_MAX_FACTS) {
            free(value);
            electron_json_fail(scenario->id,
                               "expectedPublicFacts array is too large");
        }
        for (i = 0; i < list->count; ++i) {
            if (!strcmp(list->value[i], value)) {
                free(value);
                electron_json_fail(scenario->id,
                                   "duplicate expectedPublicFacts value");
            }
        }
        nhUse(field);
        electron_test_copy_fact(list->value[list->count++], value,
                                scenario->id);
        free(value);
        if (electron_json_consume_char(pp, ']'))
            break;
        electron_json_expect_char(pp, ',', scenario->id,
                                  "expected ',' in expectedPublicFacts array");
    }
}

staticfn void
electron_test_parse_expected_facts(const char **pp,
                                   struct electron_test_scenario_v1 *scenario)
{
    unsigned seen = 0U;
    electron_json_expect_char(pp, '{', scenario->id,
                              "expected expectedPublicFacts object");
    if (electron_json_consume_char(pp, '}'))
        electron_json_fail(scenario->id, "expectedPublicFacts cannot be empty");
    for (;;) {
        char *key = electron_json_parse_string(pp, scenario->id);
        electron_json_expect_char(pp, ':', scenario->id,
                                  "expected ':' after expectedPublicFacts field");
        if (!strcmp(key, "contextActions")) {
            electron_json_require_unique(&seen, 0x01U, scenario->id, key);
            electron_test_parse_string_array(pp, scenario, key,
                                             &scenario->context_actions);
        } else if (!strcmp(key, "containerRows")) {
            electron_json_require_unique(&seen, 0x02U, scenario->id, key);
            electron_test_parse_string_array(pp, scenario, key,
                                             &scenario->container_rows);
        } else if (!strcmp(key, "inventoryRows")) {
            electron_json_require_unique(&seen, 0x04U, scenario->id, key);
            electron_test_parse_string_array(pp, scenario, key,
                                             &scenario->inventory_rows);
        } else if (!strcmp(key, "equipmentRows")) {
            electron_json_require_unique(&seen, 0x08U, scenario->id, key);
            electron_test_parse_string_array(pp, scenario, key,
                                             &scenario->equipment_rows);
        } else if (!strcmp(key, "groundRows")) {
            electron_json_require_unique(&seen, 0x10U, scenario->id, key);
            electron_test_parse_string_array(pp, scenario, key,
                                             &scenario->ground_rows);
        } else if (!strcmp(key, "monsterRows")) {
            electron_json_require_unique(&seen, 0x20U, scenario->id, key);
            electron_test_parse_string_array(pp, scenario, key,
                                             &scenario->monster_rows);
        } else if (!strcmp(key, "mapAffordances")) {
            electron_json_require_unique(&seen, 0x40U, scenario->id, key);
            electron_test_parse_string_array(pp, scenario, key,
                                             &scenario->map_affordances);
        } else if (!strcmp(key, "messages")) {
            electron_json_require_unique(&seen, 0x80U, scenario->id, key);
            electron_test_parse_string_array(pp, scenario, key,
                                             &scenario->messages);
        } else if (!strcmp(key, "status")) {
            electron_json_require_unique(&seen, 0x100U, scenario->id, key);
            electron_test_parse_string_array(pp, scenario, key,
                                             &scenario->status);
        } else {
            free(key);
            electron_json_fail(scenario->id,
                               "unsupported expectedPublicFacts field");
        }
        free(key);
        if (electron_json_consume_char(pp, '}'))
            break;
        electron_json_expect_char(pp, ',', scenario->id,
                                  "expected ',' between expectedPublicFacts fields");
    }
    scenario->expected_seen = seen;
}

staticfn boolean
electron_test_event_result_supported(const char *event, const char *result)
{
    if (!strcmp(event, "drink-fountain")
        && !strcmp(result, "monster-detection"))
        return TRUE;
    return FALSE;
}

staticfn void
electron_test_parse_event_results(const char **pp,
                                  struct electron_test_scenario_v1 *scenario)
{
    electron_json_expect_char(pp, '[', scenario->id,
                              "expected eventResults array");
    if (electron_json_consume_char(pp, ']'))
        electron_json_fail(scenario->id, "eventResults cannot be empty");
    for (;;) {
        unsigned seen = 0U;
        struct electron_test_event_result_spec *spec;
        if (scenario->event_result_count >= ELECTRON_TEST_MAX_EVENT_RESULTS)
            electron_json_fail(scenario->id, "eventResults array is too large");
        spec = &scenario->event_results[scenario->event_result_count];
        memset(spec, 0, sizeof *spec);
        electron_json_expect_char(pp, '{', scenario->id,
                                  "expected eventResults entry");
        if (electron_json_consume_char(pp, '}'))
            electron_json_fail(scenario->id,
                               "eventResults entry cannot be empty");
        for (;;) {
            char *key = electron_json_parse_string(pp, scenario->id);
            electron_json_expect_char(pp, ':', scenario->id,
                                      "expected ':' after eventResults field");
            if (!strcmp(key, "event")) {
                char *value;
                electron_json_require_unique(&seen, 0x01U, scenario->id, key);
                value = electron_json_parse_string(pp, scenario->id);
                if (!*value || strlen(value) >= sizeof spec->event) {
                    free(value);
                    electron_json_fail(scenario->id,
                                       "eventResults event length is invalid");
                }
                (void) strncpy(spec->event, value, sizeof spec->event - 1);
                spec->event[sizeof spec->event - 1] = '\0';
                free(value);
            } else if (!strcmp(key, "result")) {
                char *value;
                electron_json_require_unique(&seen, 0x02U, scenario->id, key);
                value = electron_json_parse_string(pp, scenario->id);
                if (!*value || strlen(value) >= sizeof spec->result) {
                    free(value);
                    electron_json_fail(scenario->id,
                                       "eventResults result length is invalid");
                }
                (void) strncpy(spec->result, value, sizeof spec->result - 1);
                spec->result[sizeof spec->result - 1] = '\0';
                free(value);
            } else {
                free(key);
                electron_json_fail(scenario->id,
                                   "unsupported eventResults field");
            }
            free(key);
            if (electron_json_consume_char(pp, '}'))
                break;
            electron_json_expect_char(pp, ',', scenario->id,
                                      "expected ',' between eventResults fields");
        }
        if ((seen & 0x03U) != 0x03U)
            electron_json_fail(scenario->id,
                               "eventResults entry is missing required fields");
        if (!electron_test_event_result_supported(spec->event, spec->result))
            electron_json_fail(scenario->id,
                               "unsupported eventResults event/result");
        ++scenario->event_result_count;
        if (electron_json_consume_char(pp, ']'))
            break;
        electron_json_expect_char(pp, ',', scenario->id,
                                  "expected ',' between eventResults entries");
    }
}

staticfn void
electron_test_parse_scenario_v1(const char *json,
                                struct electron_test_scenario_v1 *scenario)
{
    const char *p = json;
    const char *expected_id = nh_getenv("NH_TEST_SCENARIO_ID");
    unsigned seen = 0U;
    memset(scenario, 0, sizeof *scenario);
    scenario->safe_area = 0;
    scenario->hero_placement_distance = 4;
    electron_json_expect_char(&p, '{', scenario->id,
                              "scenario JSON root must be an object");
    if (electron_json_consume_char(&p, '}'))
        electron_json_fail(scenario->id, "scenario JSON root cannot be empty");
    for (;;) {
        char *key = electron_json_parse_string(&p, scenario->id);
        electron_json_expect_char(&p, ':', scenario->id,
                                  "expected ':' after scenario field");
        if (!strcmp(key, "schema")) {
            electron_json_require_unique(&seen, 0x001U, scenario->id, key);
            {
                char *value = electron_json_parse_string(&p, scenario->id);
                if (!strcmp(value, ELECTRON_TEST_SCENARIO_SCHEMA_V1))
                    scenario->schema_version = 1;
                else if (!strcmp(value, ELECTRON_TEST_SCENARIO_SCHEMA_V2))
                    scenario->schema_version = 2;
                else {
                    free(value);
                    electron_json_fail(scenario->id, "unsupported schema");
                }
                free(value);
            }
        } else if (!strcmp(key, "id")) {
            char *value;
            electron_json_require_unique(&seen, 0x002U, scenario->id, key);
            value = electron_json_parse_string(&p, scenario->id);
            if (!*value || strlen(value) >= sizeof scenario->id) {
                free(value);
                electron_json_fail(scenario->id, "scenario id length is invalid");
            }
            if (expected_id && *expected_id && strcmp(value, expected_id)) {
                free(value);
                electron_json_fail(scenario->id,
                                   "scenario id does not match requested id");
            }
            (void) strncpy(scenario->id, value, sizeof scenario->id - 1);
            scenario->id[sizeof scenario->id - 1] = '\0';
            free(value);
        } else if (!strcmp(key, "phase")) {
            electron_json_require_unique(&seen, 0x004U, scenario->id, key);
            {
                char *value = electron_json_parse_string(&p, scenario->id);
                if (!strcmp(value, ELECTRON_TEST_SCENARIO_PHASE_V1))
                    scenario->phase_version = 1;
                else if (!strcmp(value, ELECTRON_TEST_SCENARIO_PHASE_V2))
                    scenario->phase_version = 2;
                else {
                    free(value);
                    electron_json_fail(scenario->id, "unsupported phase");
                }
                free(value);
            }
        } else if (!strcmp(key, "hero")) {
            electron_json_require_unique(&seen, 0x008U, scenario->id, key);
            electron_test_parse_hero(&p, scenario);
        } else if (!strcmp(key, "level")) {
            electron_json_require_unique(&seen, 0x010U, scenario->id, key);
            electron_test_parse_level(&p, scenario);
        } else if (!strcmp(key, "ground")) {
            electron_json_require_unique(&seen, 0x020U, scenario->id, key);
            electron_test_parse_ground(&p, scenario);
        } else if (!strcmp(key, "inventory")) {
            electron_json_require_unique(&seen, 0x040U, scenario->id, key);
            electron_test_parse_inventory(&p, scenario);
        } else if (!strcmp(key, "monsters")) {
            electron_json_require_unique(&seen, 0x080U, scenario->id, key);
            electron_test_parse_monsters(&p, scenario);
        } else if (!strcmp(key, "expectedPublicFacts")) {
            electron_json_require_unique(&seen, 0x100U, scenario->id, key);
            electron_test_parse_expected_facts(&p, scenario);
        } else if (!strcmp(key, "eventResults")) {
            electron_json_require_unique(&seen, 0x200U, scenario->id, key);
            electron_test_parse_event_results(&p, scenario);
        } else {
            free(key);
            electron_json_fail(scenario->id, "unsupported JSON scenario field");
        }
        free(key);
        if (electron_json_consume_char(&p, '}'))
            break;
        electron_json_expect_char(&p, ',', scenario->id,
                                  "expected ',' between scenario fields");
    }
    p = electron_json_ws(p);
    if (*p)
        electron_json_fail(scenario->id, "trailing content after scenario JSON");
    if ((seen & 0x1FFU) != 0x1FFU)
        electron_json_fail(scenario->id,
                           "scenario JSON is missing required fields");
    if (scenario->phase_version != scenario->schema_version)
        electron_json_fail(scenario->id, "unsupported phase");
    if (scenario->schema_version == 1 && scenario->v2_fields_present)
        electron_json_fail(scenario->id,
                           "version two fields require version two schema");
    if (scenario->schema_version == 2 && !scenario->special_level_present)
        electron_json_fail(scenario->id,
                           "version two level object requires specialLevel");
}

staticfn void
electron_test_apply_identity(const struct electron_test_scenario_v1 *scenario)
{
    if (scenario->role_present)
        flags.initrole = scenario->role;
    if (scenario->race_present)
        flags.initrace = scenario->race;
    if (scenario->gender_present) {
        flags.initgend = scenario->gender;
        flags.female = (scenario->gender == 1) ? TRUE : FALSE;
    }
    if (scenario->alignment_present)
        flags.initalign = scenario->alignment;
}

staticfn void
electron_test_prepare_identity_from_scenario(void)
{
    const char *path = nh_getenv("NH_TEST_SCENARIO");
    char *json;
    struct electron_test_scenario_v1 scenario;

    if (!path || !*path)
        return;
    electron_test_require_runtime_gate(nh_getenv("NH_TEST_SCENARIO_ID"));
    electron_test_validate_resolved_path(path, nh_getenv("NH_TEST_SCENARIO_ID"));
    json = electron_test_read_file(path);
    electron_test_parse_scenario_v1(json, &scenario);
    free(json);
    electron_test_apply_identity(&scenario);
}

staticfn boolean
electron_test_terrain_passable(int typ, int door_mask)
{
    if (typ == DOOR && (door_mask & (D_CLOSED | D_LOCKED)))
        return FALSE;
    return ACCESSIBLE(typ) ? TRUE : FALSE;
}

staticfn boolean
electron_test_planned_accessible(const struct electron_test_scenario_v1 *scenario,
                                 coordxy x, coordxy y)
{
    int typ = levl[x][y].typ;
    int door_mask = levl[x][y].doormask;
    int i;
    if (scenario->map.present) {
        coordxy ox, oy;
        electron_test_resolve_location(&scenario->map.top_left, &ox, &oy);
        if (x >= ox && y >= oy && x < ox + scenario->map.col_count
            && y < oy + scenario->map.row_count) {
            char ch = scenario->map.rows[y - oy][x - ox];
            door_mask = 0;
            switch (ch) {
            case '.': case '@': typ = ROOM; break;
            case '#': typ = CORR; break;
            case '|': typ = VWALL; break;
            case '-': typ = HWALL; break;
            case '+': typ = DOOR; door_mask = D_CLOSED; break;
            case '/': typ = DOOR; door_mask = D_ISOPEN; break;
            case '<': case '>': typ = STAIRS; break;
            case '^': typ = ROOM; break;
            case '~': typ = POOL; break;
            case 'L': typ = LAVAPOOL; break;
            case ' ': typ = STONE; break;
            default: return FALSE;
            }
        }
    }
    for (i = 0; i < scenario->terrain_count; ++i) {
        coordxy tx, ty;
        electron_test_resolve_location(&scenario->terrain[i].loc, &tx, &ty);
        if (tx == x && ty == y) {
            typ = scenario->terrain[i].typ;
            door_mask = scenario->terrain[i].door_mask;
        }
    }
    return electron_test_terrain_passable(typ, door_mask);
}

staticfn void
electron_test_preflight_locations(const struct electron_test_scenario_v1 *scenario)
{
    int i;
    for (i = 0; i < scenario->terrain_count; ++i) {
        coordxy x, y;
        electron_test_resolve_location(&scenario->terrain[i].loc, &x, &y);
        if (!isok(x, y))
            electron_test_fixture_fail(scenario->id,
                                       "terrain location is out of bounds");
        if (x == u.ux && y == u.uy
            && !electron_test_terrain_passable(scenario->terrain[i].typ,
                                               scenario->terrain[i].door_mask))
            electron_test_fixture_fail(scenario->id,
                                       "terrain cannot block the hero");
    }
    if (scenario->map.present) {
        coordxy ox, oy;
        electron_test_resolve_location(&scenario->map.top_left, &ox, &oy);
        for (i = 0; i < scenario->map.row_count; ++i) {
            int j;
            for (j = 0; j < scenario->map.col_count; ++j) {
                coordxy x = ox + j, y = oy + i;
                char ch = scenario->map.rows[i][j];
                if (!isok(x, y))
                    electron_test_fixture_fail(scenario->id,
                                               "map location is out of bounds");
                if (x == u.ux && y == u.uy
                    && (ch == '|' || ch == '-' || ch == '+' || ch == ' '
                        || ch == '~' || ch == 'L'))
                    electron_test_fixture_fail(scenario->id,
                                               "map terrain cannot block the hero");
            }
        }
    }
    for (i = 0; i < scenario->monster_count; ++i) {
        coordxy x, y;
        electron_test_resolve_location(&scenario->monsters[i].loc, &x, &y);
        if (!isok(x, y) || (x == u.ux && y == u.uy)
            || !electron_test_planned_accessible(scenario, x, y))
            electron_test_fixture_fail(scenario->id,
                                       "monster location is not safe");
    }
    for (i = 0; i < scenario->ground_count; ++i) {
        coordxy x, y;
        electron_test_resolve_location(&scenario->ground[i].loc, &x, &y);
        if (!isok(x, y) || !electron_test_planned_accessible(scenario, x, y))
            electron_test_fixture_fail(scenario->id,
                                       "ground object location is not safe");
    }
    for (i = 0; i < scenario->monster_count; ++i) {
        coordxy mx, my;
        int j;
        electron_test_resolve_location(&scenario->monsters[i].loc, &mx, &my);
        for (j = i + 1; j < scenario->monster_count; ++j) {
            coordxy ox, oy;
            electron_test_resolve_location(&scenario->monsters[j].loc, &ox, &oy);
            if (mx == ox && my == oy)
                electron_test_fixture_fail(scenario->id,
                                           "duplicate monster location");
        }
    }
    {
        boolean weapon = FALSE, quiver = FALSE, armor = FALSE, cloak = FALSE,
                shield = FALSE, helm = FALSE, boots = FALSE, gloves = FALSE,
                shirt = FALSE, amulet = FALSE, left = FALSE, right = FALSE;
        for (i = 0; i < scenario->inventory_count; ++i) {
            const struct electron_test_object_spec *spec =
                &scenario->objects[scenario->inventory[i]];
            int typ = spec->type_id;
            switch (spec->equip_state) {
            case ELECTRON_TEST_EQUIP_WIELDED:
                if (weapon) electron_test_fixture_fail(scenario->id, "duplicate wielded equipment");
                weapon = TRUE; break;
            case ELECTRON_TEST_EQUIP_QUIVERED:
                if (quiver) electron_test_fixture_fail(scenario->id, "duplicate quivered equipment");
                quiver = TRUE; break;
            case ELECTRON_TEST_EQUIP_LEFT_RING:
                if (left) electron_test_fixture_fail(scenario->id, "duplicate left ring equipment");
                left = TRUE; break;
            case ELECTRON_TEST_EQUIP_RIGHT_RING:
                if (right) electron_test_fixture_fail(scenario->id, "duplicate right ring equipment");
                right = TRUE; break;
            case ELECTRON_TEST_EQUIP_WORN:
                if (objects[typ].oc_class == AMULET_CLASS) {
                    if (amulet) electron_test_fixture_fail(scenario->id, "duplicate amulet equipment");
                    amulet = TRUE;
                } else {
                    struct obj tmpobj;
                    struct obj *tmpobjp;
                    memset(&tmpobj, 0, sizeof tmpobj);
                    tmpobj.otyp = typ;
                    tmpobj.oclass = objects[typ].oc_class;
                    tmpobjp = &tmpobj;
                    if (is_helmet(tmpobjp)) { if (helm) electron_test_fixture_fail(scenario->id, "duplicate helmet equipment"); helm = TRUE; }
                    else if (is_gloves(tmpobjp)) { if (gloves) electron_test_fixture_fail(scenario->id, "duplicate gloves equipment"); gloves = TRUE; }
                    else if (is_shirt(tmpobjp)) { if (shirt) electron_test_fixture_fail(scenario->id, "duplicate shirt equipment"); shirt = TRUE; }
                    else if (is_cloak(tmpobjp)) { if (cloak) electron_test_fixture_fail(scenario->id, "duplicate cloak equipment"); cloak = TRUE; }
                    else if (is_boots(tmpobjp)) { if (boots) electron_test_fixture_fail(scenario->id, "duplicate boots equipment"); boots = TRUE; }
                    else if (is_shield(tmpobjp)) { if (shield) electron_test_fixture_fail(scenario->id, "duplicate shield equipment"); shield = TRUE; }
                    else if (is_suit(tmpobjp)) { if (armor) electron_test_fixture_fail(scenario->id, "duplicate armor equipment"); armor = TRUE; }
                    else if (objects[typ].oc_class == RING_CLASS) { if (left && right) electron_test_fixture_fail(scenario->id, "duplicate ring equipment"); if (!left) left = TRUE; else right = TRUE; }
                }
                break;
            default:
                break;
            }
        }
    }
}

staticfn void
electron_test_apply_special_level(const struct electron_test_scenario_v1 *scenario)
{
    s_level *slev = (s_level *) 0;
    d_level target;
    boolean was_wizard;
    char resolved[32];

    if (!scenario->special_level_present)
        return;
    if (!strcmp(scenario->special_level, "invocation")) {
        target.dnum = valley_level.dnum;
        target.dlevel =
            svd.dungeons[target.dnum].num_dunlevs - 1;
    } else {
        const char *level_name = scenario->special_level;
        if (scenario->special_level[0] == 'x'
            && scenario->special_level[1] == '-') {
            Sprintf(resolved, "%s%s", gu.urole.filecode,
                    &scenario->special_level[1]);
            level_name = resolved;
        }
        slev = find_level(level_name);
        if (!slev)
            electron_test_fixture_fail(
                scenario->id,
                "requested specialLevel was not generated");
        assign_level(&target, &slev->dlevel);
    }
    was_wizard = wizard;
    wizard = TRUE;
    goto_level(&target, FALSE, FALSE, FALSE);
    wizard = was_wizard;
    if (!on_level(&u.uz, &target))
        electron_test_fixture_fail(scenario->id,
                                   "failed to enter requested specialLevel");
}

staticfn boolean
electron_test_find_hero_target(const struct electron_test_scenario_v1 *scenario,
                               coordxy *target_x, coordxy *target_y)
{
    coordxy x, y;
    for (x = 1; x < COLNO; ++x) {
        for (y = 0; y < ROWNO; ++y) {
            if (scenario->hero_placement == ELECTRON_TEST_HERO_NEAR_MONSTER) {
                struct monst *mon = m_at(x, y);
                if (mon && monsndx(mon->data) == scenario->hero_placement_target) {
                    *target_x = x;
                    *target_y = y;
                    return TRUE;
                }
            } else if (scenario->hero_placement == ELECTRON_TEST_HERO_NEAR_OBJECT) {
                if (sobj_at(scenario->hero_placement_target, x, y)) {
                    *target_x = x;
                    *target_y = y;
                    return TRUE;
                }
            } else if ((scenario->hero_placement == ELECTRON_TEST_HERO_NEAR_TERRAIN
                        || scenario->hero_placement == ELECTRON_TEST_HERO_ON_TERRAIN)
                       && levl[x][y].typ == scenario->hero_placement_target
                       && (scenario->hero_placement_target != ALTAR
                           || Amask2align(levl[x][y].altarmask & AM_MASK)
                              == u.ualign.type)) {
                *target_x = x;
                *target_y = y;
                return TRUE;
            }
        }
    }
    return FALSE;
}

staticfn boolean
electron_test_find_spot_near_target(coordxy *x, coordxy *y,
                                    coordxy target_x, coordxy target_y,
                                    int max_distance)
{
    int radius, dx, dy;
    for (radius = 1; radius <= max_distance; ++radius) {
        for (dy = -radius; dy <= radius; ++dy) {
            for (dx = -radius; dx <= radius; ++dx) {
                coordxy tx, ty;
                if (abs(dx) != radius && abs(dy) != radius)
                    continue;
                tx = target_x + dx;
                ty = target_y + dy;
                if (isok(tx, ty) && ACCESSIBLE(levl[tx][ty].typ)
                    && !is_pool(tx, ty) && !is_lava(tx, ty)
                    && !MON_AT(tx, ty) && !sobj_at(BOULDER, tx, ty)) {
                    *x = tx;
                    *y = ty;
                    return TRUE;
                }
            }
        }
    }
    return FALSE;
}

staticfn void
electron_test_apply_hero(const struct electron_test_scenario_v1 *scenario)
{
    coordxy x, y, oldx, oldy, target_x, target_y;
    if (scenario->hero_placement == ELECTRON_TEST_HERO_CURRENT)
        return;
    oldx = u.ux;
    oldy = u.uy;
    if (scenario->hero_placement == ELECTRON_TEST_HERO_NEAREST_SAFE_FLOOR) {
        if (!find_electron_test_spot(&x, &y, oldx, oldy))
            electron_test_fixture_fail(scenario->id,
                                       "failed to place hero on nearest safe floor");
    } else if (scenario->hero_placement
               == ELECTRON_TEST_HERO_ON_INVOCATION_POSITION) {
        if (!invocation_pos(svi.inv_pos.x, svi.inv_pos.y)
            || MON_AT(svi.inv_pos.x, svi.inv_pos.y))
            electron_test_fixture_fail(
                scenario->id,
                "invocation position is unavailable or occupied");
        x = svi.inv_pos.x;
        y = svi.inv_pos.y;
    } else {
        if (!electron_test_find_hero_target(scenario, &target_x, &target_y))
            electron_test_fixture_fail(scenario->id,
                                       "hero placementTarget is absent from specialLevel");
        if (scenario->wake_placement_target) {
            struct monst *target_mon = m_at(target_x, target_y);
            if (!target_mon)
                electron_test_fixture_fail(
                    scenario->id,
                    "wakePlacementTarget did not resolve a monster");
            target_mon->msleeping = 0;
            target_mon->mfrozen = 0;
            target_mon->mcanmove = 1;
        }
        if (scenario->hero_placement == ELECTRON_TEST_HERO_ON_TERRAIN) {
            if (MON_AT(target_x, target_y))
                electron_test_fixture_fail(scenario->id,
                                           "hero on-terrain target is occupied");
            x = target_x;
            y = target_y;
        } else if (!electron_test_find_spot_near_target(
                       &x, &y, target_x, target_y,
                       scenario->hero_placement_distance))
            electron_test_fixture_fail(scenario->id,
                                       "no safe hero position exists near placementTarget");
    }
    u_on_newpos(x, y);
    newsym(oldx, oldy);
    newsym(u.ux, u.uy);
}

staticfn void
electron_test_apply_hero_state(const struct electron_test_scenario_v1 *scenario)
{
    if (scenario->experience_level_present) {
        u.ulevel = scenario->experience_level;
        u.ulevelmax = scenario->experience_level;
    }
    if (scenario->hp_present) {
        u.uhpmax = scenario->maxhp;
        u.uhp = scenario->hp;
    }
    if (scenario->power_present) {
        u.uenmax = scenario->maxpower;
        u.uen = scenario->power;
    }
    if (scenario->intrinsic_count) {
        int i;
        for (i = 0; i < scenario->intrinsic_count; ++i)
            u.uprops[scenario->intrinsics[i]].intrinsic |= FROMOUTSIDE;
    }
    if (scenario->amulet_wish_complete)
        u.uevent.amulet_wish = 1;
    if (scenario->alignment_record_present)
        u.ualign.record = scenario->alignment_record;
    disp.botl = TRUE;
}

staticfn void
electron_test_apply_level(const struct electron_test_scenario_v1 *scenario)
{
    int dx, dy;
    if (scenario->level_lit) {
        for (dx = -scenario->safe_area; dx <= scenario->safe_area; ++dx) {
            for (dy = -scenario->safe_area; dy <= scenario->safe_area; ++dy) {
                coordxy x = u.ux + dx, y = u.uy + dy;
                if (isok(x, y)) {
                    levl[x][y].lit = 1;
                    levl[x][y].waslit = 1;
                    newsym(x, y);
                }
            }
        }
    }
    if (scenario->pet_none)
        electron_test_remove_pets();
    if (scenario->suppress_adjacent_monsters)
        electron_test_clear_adjacent_monsters(scenario->safe_area);
}

staticfn void
electron_test_apply_terrain_tile(const char *id, coordxy x, coordxy y,
                                 int typ, int door_mask, int trap,
                                 int stair_down)
{
    struct rm *room;
    struct trap *oldtrap;
    if (!isok(x, y))
        electron_test_fixture_fail(id, "terrain location is out of bounds");
    if (x == u.ux && y == u.uy && !electron_test_terrain_passable(typ, door_mask))
        electron_test_fixture_fail(id, "terrain cannot block the hero");
    if (MON_AT(x, y) && !electron_test_terrain_passable(typ, door_mask))
        electron_test_fixture_fail(id, "terrain cannot block a monster");
    room = &levl[x][y];
    room->typ = (schar) typ;
    room->doormask = ((typ == STAIRS || typ == LADDER) && stair_down >= 0)
        ? (uchar) (stair_down ? LA_DOWN : LA_UP)
        : (uchar) door_mask;
    room->lit = 1;
    room->waslit = 1;
    oldtrap = t_at(x, y);
    if (oldtrap)
        deltrap(oldtrap);
    if (trap != NO_TRAP) {
        struct trap *ttmp = maketrap(x, y, trap);
        if (!ttmp)
            electron_test_fixture_fail(id, "failed to create terrain trap");
        ttmp->tseen = 1;
    }
    unblock_point(x, y);
    if (!electron_test_terrain_passable(typ, door_mask))
        block_point(x, y);
    if ((typ == STAIRS || typ == LADDER) && stair_down >= 0) {
        boolean is_ladder = typ == LADDER;
        stairway *stway = stairway_find_type_dir(is_ladder, stair_down ? FALSE : TRUE);
        if (stway) {
            coordxy oldx = stway->sx, oldy = stway->sy;
            stairway *other = stairway_find_type_dir(is_ladder, stair_down ? TRUE : FALSE);
            if (isok(oldx, oldy) && (oldx != x || oldy != y)) {
                if (other && other->sx == x && other->sy == y) {
                    other->sx = oldx;
                    other->sy = oldy;
                    levl[oldx][oldy].typ = (schar) typ;
                    levl[oldx][oldy].doormask = (uchar) (stair_down ? LA_UP : LA_DOWN);
                } else {
                    levl[oldx][oldy].typ = ROOM;
                    levl[oldx][oldy].doormask = 0;
                }
                newsym(oldx, oldy);
            }
            stway->sx = x;
            stway->sy = y;
            stway->isladder = is_ladder;
        } else {
            d_level dest;
            get_level(&dest, stair_down ? depth(&u.uz) + 1 : depth(&u.uz) - 1);
            stairway_add(x, y, stair_down ? FALSE : TRUE, is_ladder, &dest);
        }
    }
    newsym(x, y);
}

staticfn void
electron_test_apply_terrain(const struct electron_test_scenario_v1 *scenario)
{
    int i;
    if (scenario->map.present) {
        coordxy ox, oy;
        electron_test_resolve_location(&scenario->map.top_left, &ox, &oy);
        for (i = 0; i < scenario->map.row_count; ++i) {
            int j;
            for (j = 0; j < scenario->map.col_count; ++j) {
                int door_mask = 0, trap = NO_TRAP, typ = ROOM;
                char ch = scenario->map.rows[i][j];
                coordxy x = ox + j, y = oy + i;
                switch (ch) {
                case '.': typ = ROOM; break;
                case '#': typ = CORR; break;
                case '|': typ = VWALL; break;
                case '-': typ = HWALL; break;
                case '+': typ = DOOR; door_mask = D_CLOSED; break;
                case '/': typ = DOOR; door_mask = D_ISOPEN; break;
                case '<': typ = STAIRS; break;
                case '>': typ = STAIRS; break;
                case '^': typ = ROOM; trap = PIT; break;
                case '~': typ = POOL; break;
                case 'L': typ = LAVAPOOL; break;
                case ' ': typ = STONE; break;
                case '@': typ = ROOM; break;
                default:
                    electron_test_fixture_fail(scenario->id,
                                               "unsupported map terrain symbol");
                }
                electron_test_apply_terrain_tile(scenario->id, x, y, typ,
                                                 door_mask, trap,
                                                 ch == '>' ? 1 : (ch == '<' ? 0 : -1));
                if (typ == DOOR) {
                    levl[x][y].horizontal = (j > 0 && scenario->map.rows[i][j - 1] == '-')
                        || (j + 1 < scenario->map.col_count && scenario->map.rows[i][j + 1] == '-');
                    newsym(x, y);
                }
            }
        }
    }
    for (i = 0; i < scenario->terrain_count; ++i) {
        coordxy x, y;
        electron_test_resolve_location(&scenario->terrain[i].loc, &x, &y);
        electron_test_apply_terrain_tile(scenario->id, x, y,
            scenario->terrain[i].typ, scenario->terrain[i].door_mask,
            scenario->terrain[i].trap, scenario->terrain[i].stair_down);
        if (scenario->terrain[i].typ == DOOR) {
            levl[x][y].horizontal = (isok(x - 1, y) && levl[x - 1][y].typ == HWALL)
                || (isok(x + 1, y) && levl[x + 1][y].typ == HWALL);
            newsym(x, y);
        }
    }
}

staticfn void
electron_test_apply_monsters(const struct electron_test_scenario_v1 *scenario)
{
    int i;
    for (i = 0; i < scenario->monster_count; ++i) {
        coordxy x, y;
        struct monst *mtmp;
        electron_test_resolve_location(&scenario->monsters[i].loc, &x, &y);
        if (!isok(x, y) || !ACCESSIBLE(levl[x][y].typ)
            || (x == u.ux && y == u.uy) || MON_AT(x, y))
            electron_test_fixture_fail(scenario->id,
                                       "monster location is not safe");
        mtmp = makemon(&mons[scenario->monsters[i].monster_id], x, y,
                       MM_NOGRP | MM_NOCOUNTBIRTH);
        if (!mtmp)
            electron_test_fixture_fail(scenario->id,
                                       "failed to create scenario monster");
        if (scenario->monsters[i].attitude == 2) {
            mtmp->mtame = 10;
            mtmp->mpeaceful = 1;
        } else if (scenario->monsters[i].attitude == 1) {
            mtmp->mpeaceful = 1;
            mtmp->mtame = 0;
        } else {
            mtmp->mpeaceful = 0;
            mtmp->mtame = 0;
        }
        if (scenario->monsters[i].asleep_present)
            mtmp->msleeping = scenario->monsters[i].asleep ? 1 : 0;
        if (scenario->monsters[i].maxhp)
            mtmp->mhpmax = scenario->monsters[i].maxhp;
        if (scenario->monsters[i].hp_present)
            mtmp->mhp = scenario->monsters[i].hp;
        else if (scenario->monsters[i].maxhp)
            mtmp->mhp = scenario->monsters[i].maxhp;
        newsym(x, y);
    }
}

staticfn void
electron_test_clear_adjacent_monsters(int radius)
{
    struct monst *mtmp, *nmon;
    if (radius < 1)
        radius = 1;
    for (mtmp = fmon; mtmp; mtmp = nmon) {
        int dx = (int) mtmp->mx - (int) u.ux;
        int dy = (int) mtmp->my - (int) u.uy;
        nmon = mtmp->nmon;
        if (dx < 0)
            dx = -dx;
        if (dy < 0)
            dy = -dy;
        if (dx <= radius && dy <= radius)
            mongone(mtmp);
    }
}

staticfn void
electron_test_remove_pets(void)
{
    struct monst *mtmp, *nmon;
    for (mtmp = fmon; mtmp; mtmp = nmon) {
        nmon = mtmp->nmon;
        if (mtmp->mtame) {
            relmon(mtmp, (struct monst **) 0);
            discard_minvent(mtmp, FALSE);
            dealloc_monst(mtmp);
        }
    }
}

staticfn void
electron_test_apply_object_metadata(struct obj *obj,
                                    const struct electron_test_object_spec *spec)
{
    if (!obj)
        return;
    obj->dknown = 1;
    if (spec->quantity > 1L) {
        obj->quan = spec->quantity;
        obj->owt = weight(obj);
    }
    if (spec->identity_known_present) {
        if (spec->identity_known)
            makeknown(spec->type_id);
        else if (spec->type_id >= 0 && spec->type_id < NUM_OBJECTS)
            objects[spec->type_id].oc_name_known = 0;
        obj->known = spec->identity_known ? 1 : 0;
        obj->dknown = 1;
    }
    if (spec->beatitude_known_present)
        obj->bknown = spec->beatitude_known ? 1 : 0;
    if (spec->beatitude != ELECTRON_TEST_BEATITUDE_UNSET) {
        obj->blessed = spec->beatitude > 0 ? 1 : 0;
        obj->cursed = spec->beatitude < 0 ? 1 : 0;
        obj->bknown = spec->beatitude_known_present ? obj->bknown : 1;
    }
    if (spec->charges_present)
        obj->spe = (schar) spec->charges;
    if (spec->fuel_present)
        obj->age = spec->fuel;
    if (spec->enchantment_present)
        obj->spe = (schar) spec->enchantment;
    if (spec->erosion_present)
        obj->oeroded = (unsigned) spec->erosion;
    if (spec->corrosion_present)
        obj->oeroded2 = (unsigned) spec->corrosion;
    if (spec->poisoned_present)
        obj->opoisoned = spec->poisoned ? 1 : 0;
    if (spec->called_name_present) {
        if (objects[spec->type_id].oc_uname)
            free((genericptr_t) objects[spec->type_id].oc_uname);
        objects[spec->type_id].oc_uname = dupstr(spec->called_name);
    }
    if (spec->individual_name_present) {
        new_oname(obj, (int) strlen(spec->individual_name) + 1);
        Strcpy(ONAME(obj), spec->individual_name);
    }
    obj->owt = weight(obj);
}

staticfn struct obj *
electron_test_make_object(const struct electron_test_scenario_v1 *scenario,
                          int object_index, coordxy x, coordxy y,
                          boolean at_location)
{
    const struct electron_test_object_spec *spec = &scenario->objects[object_index];
    struct obj *obj;
    int i;

    obj = at_location ? mksobj_at(spec->type_id, x, y, FALSE, FALSE)
                      : mksobj(spec->type_id, TRUE, FALSE);
    if (!obj)
        electron_test_fixture_fail(scenario->id, "failed to create scenario object");
    if (spec->type_id == CORPSE && spec->corpse_monster_present)
        set_corpsenm(obj, spec->corpse_monster_id);
    electron_test_apply_object_metadata(obj, spec);
    if (electron_test_is_container_type(spec->type_id)) {
        obj->olocked = spec->locked ? 1 : 0;
        obj->otrapped = spec->trapped ? 1 : 0;
        obj->cknown = 1;
        obj->lknown = spec->lock_known_present ? (spec->lock_known ? 1 : 0) : 1;
        obj->tknown = spec->trap_present ? 1 : 0;
        for (i = 0; i < spec->content_count; ++i) {
            struct obj *content = electron_test_make_object(scenario,
                spec->first_content + i, 0, 0, FALSE);
            if (!add_to_container(obj, content))
                electron_test_fixture_fail(scenario->id,
                                           "failed to add object to container");
        }
        obj->owt = weight(obj);
    }
    return obj;
}

staticfn void
electron_test_resolve_location(const struct electron_test_location_spec *loc,
                               coordxy *x, coordxy *y)
{
    if (loc->absolute) {
        *x = (coordxy) loc->x;
        *y = (coordxy) loc->y;
    } else {
        *x = (coordxy) (u.ux + loc->dx);
        *y = (coordxy) (u.uy + loc->dy);
    }
}

staticfn void
electron_test_apply_ground(const struct electron_test_scenario_v1 *scenario)
{
    int i;
    for (i = 0; i < scenario->ground_count; ++i) {
        coordxy x, y;
        electron_test_resolve_location(&scenario->ground[i].loc, &x, &y);
        if (!isok(x, y) || !ACCESSIBLE(levl[x][y].typ))
            electron_test_fixture_fail(scenario->id,
                                       "ground object location is not safe");
        (void) electron_test_make_object(scenario,
                                         scenario->ground[i].object_index,
                                         x, y, TRUE);
        newsym(x, y);
    }
}

staticfn void
electron_test_clear_inventory(void)
{
    setuwep((struct obj *) 0);
    setuswapwep((struct obj *) 0);
    setuqwep((struct obj *) 0);
    setworn((struct obj *) 0, W_ARMOR | W_RING | W_AMUL | W_TOOL);
    while (gi.invent)
        useupall(gi.invent);
    update_inventory();
}

staticfn void
electron_test_apply_equipment(struct obj *obj,
                              const struct electron_test_object_spec *spec,
                              const char *id)
{
    long mask = 0L;
    if (!obj || spec->equip_state == ELECTRON_TEST_EQUIP_NONE)
        return;
    switch (spec->equip_state) {
    case ELECTRON_TEST_EQUIP_WIELDED:
        setuswapwep((struct obj *) 0);
        setuwep(obj);
        setuswapwep((struct obj *) 0);
        obj->owornmask &= ~W_SWAPWEP;
        break;
    case ELECTRON_TEST_EQUIP_QUIVERED:
        setuqwep(obj);
        break;
    case ELECTRON_TEST_EQUIP_LEFT_RING:
        mask = W_RINGL;
        break;
    case ELECTRON_TEST_EQUIP_RIGHT_RING:
        mask = W_RINGR;
        break;
    case ELECTRON_TEST_EQUIP_WORN:
        if (objects[obj->otyp].oc_class == RING_CLASS)
            mask = uleft ? W_RINGR : W_RINGL;
        else if (objects[obj->otyp].oc_class == AMULET_CLASS)
            mask = W_AMUL;
        else if (is_helmet(obj))
            mask = W_ARMH;
        else if (is_gloves(obj))
            mask = W_ARMG;
        else if (is_shirt(obj))
            mask = W_ARMU;
        else if (is_cloak(obj))
            mask = W_ARMC;
        else if (is_boots(obj))
            mask = W_ARMF;
        else if (is_shield(obj))
            mask = W_ARMS;
        else if (is_suit(obj))
            mask = W_ARM;
        break;
    default:
        electron_test_fixture_fail(id, "unsupported equipped state");
    }
    if (mask) {
        if ((mask == W_RINGL && uleft) || (mask == W_RINGR && uright)
            || (mask == W_AMUL && uamul) || (mask == W_ARMH && uarmh)
            || (mask == W_ARMG && uarmg) || (mask == W_ARMU && uarmu)
            || (mask == W_ARMC && uarmc) || (mask == W_ARMF && uarmf)
            || (mask == W_ARMS && uarms) || (mask == W_ARM && uarm))
            electron_test_fixture_fail(id, "equipment slot is already occupied");
        setworn(obj, mask);
    }
    update_inventory();
}

staticfn void
electron_test_apply_inventory(const struct electron_test_scenario_v1 *scenario)
{
    int i;
    boolean has_explicit_quiver = FALSE;
    electron_test_clear_inventory();
    for (i = 0; i < scenario->inventory_count; ++i) {
        struct obj *obj = electron_test_make_object(scenario,
                                                    scenario->inventory[i],
                                                    0, 0, FALSE);
        if (!addinv(obj))
            electron_test_fixture_fail(scenario->id,
                                       "failed to add object to inventory");
        if (scenario->objects[scenario->inventory[i]].equip_state
                == ELECTRON_TEST_EQUIP_NONE
            && uquiver == obj) {
            setuqwep((struct obj *) 0);
            obj->owornmask &= ~W_QUIVER;
        }
        if (scenario->objects[scenario->inventory[i]].equip_state
                == ELECTRON_TEST_EQUIP_QUIVERED)
            has_explicit_quiver = TRUE;
        electron_test_apply_equipment(obj,
            &scenario->objects[scenario->inventory[i]], scenario->id);
    }
    if (!has_explicit_quiver) {
        struct obj *otmp;
        setuqwep((struct obj *) 0);
        for (otmp = gi.invent; otmp; otmp = otmp->nobj)
            otmp->owornmask &= ~W_QUIVER;
    }
    update_inventory();
}

staticfn void
electron_test_apply_event_results(const struct electron_test_scenario_v1 *scenario)
{
    int i;
    electron_test_active_event_result_count = scenario->event_result_count;
    memset(electron_test_active_event_results, 0,
           sizeof electron_test_active_event_results);
    for (i = 0; i < scenario->event_result_count; ++i)
        electron_test_active_event_results[i] = scenario->event_results[i];
}

boolean
electron_test_consume_event_result(const char *event, const char *result)
{
    int i;
    if (!event || !result)
        return FALSE;
    for (i = 0; i < electron_test_active_event_result_count; ++i) {
        struct electron_test_event_result_spec *spec =
            &electron_test_active_event_results[i];
        if (!spec->consumed && !strcmp(spec->event, event)
            && !strcmp(spec->result, result)) {
            spec->consumed = TRUE;
            return TRUE;
        }
    }
    return FALSE;
}

staticfn void
electron_test_json_append(char **out, char *end, const char *text,
                          const char *id)
{
    size_t len = strlen(text);
    if (*out + len >= end)
        electron_test_fixture_fail(id, "expectedPublicFacts JSON is too large");
    (void) memcpy(*out, text, len);
    *out += len;
    **out = '\0';
}

staticfn void
electron_test_json_append_escaped(char **out, char *end, const char *text,
                                  const char *id)
{
    const char *p;
    for (p = text; *p; ++p) {
        char tmp[8];
        unsigned char c = (unsigned char) *p;
        if (*out + 7 >= end)
            electron_test_fixture_fail(id,
                                       "expectedPublicFacts JSON is too large");
        switch (c) {
        case '\\': electron_test_json_append(out, end, "\\\\", id); break;
        case '"': electron_test_json_append(out, end, "\\\"", id); break;
        case '\n': electron_test_json_append(out, end, "\\n", id); break;
        case '\r': electron_test_json_append(out, end, "\\r", id); break;
        case '\t': electron_test_json_append(out, end, "\\t", id); break;
        default:
            if (c < 32) {
                Sprintf(tmp, "\\u%04x", (unsigned) c);
                electron_test_json_append(out, end, tmp, id);
            } else {
                **out = (char) c;
                ++*out;
                **out = '\0';
            }
        }
    }
}

staticfn void
electron_test_json_append_list(char **out, char *end, const char *name,
                               const struct electron_test_expected_list *list,
                               const char *id, boolean *need_comma)
{
    int i;
    if (list->count <= 0)
        return;
    if (*need_comma)
        electron_test_json_append(out, end, ",", id);
    *need_comma = TRUE;
    electron_test_json_append(out, end, "\"", id);
    electron_test_json_append(out, end, name, id);
    electron_test_json_append(out, end, "\":[", id);
    for (i = 0; i < list->count; ++i) {
        if (i)
            electron_test_json_append(out, end, ",", id);
        electron_test_json_append(out, end, "\"", id);
        electron_test_json_append_escaped(out, end, list->value[i], id);
        electron_test_json_append(out, end, "\"", id);
    }
    electron_test_json_append(out, end, "]", id);
}

staticfn void
electron_test_build_expected_facts(const struct electron_test_scenario_v1 *scenario,
                                   char *buf, size_t bufsz)
{
    char *out = buf, *end = buf + bufsz;
    boolean need_comma = FALSE;
    if (bufsz < 3)
        electron_test_fixture_fail(scenario->id,
                                   "expectedPublicFacts JSON buffer is too small");
    *out = '\0';
    electron_test_json_append(&out, end, "{", scenario->id);
    electron_test_json_append_list(&out, end, "contextActions",
                                   &scenario->context_actions, scenario->id,
                                   &need_comma);
    electron_test_json_append_list(&out, end, "containerRows",
                                   &scenario->container_rows, scenario->id,
                                   &need_comma);
    electron_test_json_append_list(&out, end, "inventoryRows",
                                   &scenario->inventory_rows, scenario->id,
                                   &need_comma);
    electron_test_json_append_list(&out, end, "equipmentRows",
                                   &scenario->equipment_rows, scenario->id,
                                   &need_comma);
    electron_test_json_append_list(&out, end, "groundRows",
                                   &scenario->ground_rows, scenario->id,
                                   &need_comma);
    electron_test_json_append_list(&out, end, "monsterRows",
                                   &scenario->monster_rows, scenario->id,
                                   &need_comma);
    electron_test_json_append_list(&out, end, "mapAffordances",
                                   &scenario->map_affordances, scenario->id,
                                   &need_comma);
    electron_test_json_append_list(&out, end, "messages",
                                   &scenario->messages, scenario->id,
                                   &need_comma);
    electron_test_json_append_list(&out, end, "status",
                                   &scenario->status, scenario->id,
                                   &need_comma);
    electron_test_json_append(&out, end, "}", scenario->id);
}

staticfn void
maybe_setup_electron_json_test_scenario(void)
{
    const char *path = nh_getenv("NH_TEST_SCENARIO");
    char *json, facts[4096];
    struct electron_test_scenario_v1 scenario;

    if (!path || !*path)
        return;
    electron_test_require_runtime_gate(nh_getenv("NH_TEST_SCENARIO_ID"));
    electron_test_validate_resolved_path(path, nh_getenv("NH_TEST_SCENARIO_ID"));

    json = electron_test_read_file(path);
    electron_test_parse_scenario_v1(json, &scenario);
    free(json);

    /* Parsing and ordinary placement preflight complete before mutation.
       Version two inventories are installed before travel so authentic
       endgame admission checks and worn protections use real core state.
       Relative additions are validated again after special-level travel and
       targeted hero placement. */
    electron_test_preflight_locations(&scenario);
    if (scenario.special_level_present) {
        electron_test_apply_inventory(&scenario);
        electron_test_apply_special_level(&scenario);
    }
    electron_test_apply_hero(&scenario);
    electron_test_preflight_locations(&scenario);
    electron_test_apply_level(&scenario);
    electron_test_apply_terrain(&scenario);
    electron_test_apply_ground(&scenario);
    electron_test_apply_monsters(&scenario);
    if (!scenario.special_level_present)
        electron_test_apply_inventory(&scenario);
    electron_test_apply_hero_state(&scenario);
    electron_test_apply_event_results(&scenario);
    newsym(u.ux, u.uy);
    disp.botlx = TRUE;
    electron_test_build_expected_facts(&scenario, facts, sizeof facts);
    electron_test_fixture_event("bridge_test_scenario_loaded",
        scenario.id, "loaded", facts);
}
#else
staticfn void
maybe_setup_electron_json_test_scenario(void)
{
    if (nh_getenv("NH_TEST_SCENARIO") || nh_getenv("NH_TEST_SCENARIO_ID"))
        nh_terminate(EXIT_FAILURE);
}
#endif

staticfn void
maybe_setup_electron_pickup_test_pile(void)
{
    struct obj *otmp;

#ifndef NH_ELECTRON_TEST_FIXTURES
    nhUse(otmp);
    return;
#else
    if (!nh_getenv("NH_SHIM_TEST_PICKUP_PILE"))
        return;
    electron_test_require_runtime_gate("NH_SHIM_TEST_PICKUP_PILE");

    (void) mksobj_at(FOOD_RATION, u.ux, u.uy, FALSE, FALSE);
    (void) mksobj_at(DAGGER, u.ux, u.uy, FALSE, FALSE);
    otmp = mksobj_at(ARROW, u.ux, u.uy, FALSE, FALSE);
    if (otmp) {
        otmp->quan = 3L;
        otmp->owt = weight(otmp);
    }
    newsym(u.ux, u.uy);
#endif
}

staticfn boolean
find_electron_test_spot(coordxy *x, coordxy *y, coordxy avoid_x,
                        coordxy avoid_y)
{
    static const schar offsets[][2] = {
        { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 },
        { 1, 1 }, { -1, 1 }, { 1, -1 }, { -1, -1 },
        { 2, 0 }, { -2, 0 }, { 0, 2 }, { 0, -2 }
    };
    int i;

    for (i = 0; i < SIZE(offsets); ++i) {
        coordxy tx = u.ux + offsets[i][0], ty = u.uy + offsets[i][1];
        if (tx == avoid_x && ty == avoid_y)
            continue;
        if (isok(tx, ty) && ACCESSIBLE(levl[tx][ty].typ) && !MON_AT(tx, ty)) {
            *x = tx;
            *y = ty;
            return TRUE;
        }
    }
    return FALSE;
}

staticfn void
maybe_setup_electron_container_transfer_test_scene(void)
{
    struct obj *box, *obj;

#ifndef NH_ELECTRON_TEST_FIXTURES
    nhUse(box);
    nhUse(obj);
    return;
#else
    if (!nh_getenv("NH_SHIM_TEST_CONTAINER_TRANSFER_SCENE"))
        return;
    electron_test_require_runtime_gate("NH_SHIM_TEST_CONTAINER_TRANSFER_SCENE");

    box = mksobj_at(LARGE_BOX, u.ux, u.uy, FALSE, FALSE);
    if (box) {
        box->olocked = 0;
        box->otrapped = 0;
        obj = mksobj(FOOD_RATION, TRUE, FALSE);
        if (obj)
            (void) add_to_container(box, obj);
        obj = mksobj(DAGGER, TRUE, FALSE);
        if (obj)
            (void) add_to_container(box, obj);
        box->owt = weight(box);
        box->cknown = 1;
        box->lknown = 1;
    }
    obj = mksobj(TIN_OPENER, TRUE, FALSE);
    if (obj)
        (void) addinv(obj);
    obj = mksobj(SCR_IDENTIFY, TRUE, FALSE);
    if (obj)
        (void) addinv(obj);
    newsym(u.ux, u.uy);
    update_inventory();
#endif
}

staticfn void
maybe_setup_electron_container_context_test_scene(void)
{
    struct obj *box;
    coordxy ax, ay;

#ifndef NH_ELECTRON_TEST_FIXTURES
    nhUse(box);
    nhUse(ax);
    nhUse(ay);
    return;
#else
    if (!nh_getenv("NH_SHIM_TEST_CONTAINER_CONTEXT_SCENE"))
        return;
    electron_test_require_runtime_gate("NH_SHIM_TEST_CONTAINER_CONTEXT_SCENE");

    box = mksobj_at(LARGE_BOX, u.ux, u.uy, FALSE, FALSE);
    if (box) {
        box->olocked = 1;
        box->otrapped = 1;
    }
    if (find_electron_test_spot(&ax, &ay, u.ux, u.uy)) {
        box = mksobj_at(CHEST, ax, ay, FALSE, FALSE);
        if (box)
            box->olocked = 1;
        newsym(ax, ay);
    }
    newsym(u.ux, u.uy);
#endif
}

staticfn void
maybe_setup_electron_locked_door_test_scene(void)
{
    coordxy dx, dy;
    struct rm *door;

#ifndef NH_ELECTRON_TEST_FIXTURES
    nhUse(dx);
    nhUse(dy);
    nhUse(door);
    return;
#else
    if (!nh_getenv("NH_SHIM_TEST_LOCKED_DOOR_SCENE"))
        return;
    electron_test_require_runtime_gate("NH_SHIM_TEST_LOCKED_DOOR_SCENE");

    if (!find_electron_test_spot(&dx, &dy, u.ux, u.uy))
        return;
    door = &levl[dx][dy];
    door->typ = DOOR;
    door->doormask = D_LOCKED;
    door->glyph = cmap_to_glyph(S_vcdoor);
    block_point(dx, dy);
    newsym(dx, dy);
#endif
}

staticfn void
maybe_setup_electron_shop_payment_test_scene(void)
{
    struct mkroom *sroom = (struct mkroom *) 0;
    struct monst *shkp, *mtmp;
    struct obj *otmp, *gold;
    coordxy px = 0, py = 0, oldx, oldy;
    int i, dx, dy;
    const char *mode;

#ifndef NH_ELECTRON_TEST_FIXTURES
    nhUse(sroom);
    nhUse(shkp);
    nhUse(mtmp);
    nhUse(otmp);
    nhUse(gold);
    nhUse(px);
    nhUse(py);
    nhUse(oldx);
    nhUse(oldy);
    nhUse(i);
    nhUse(dx);
    nhUse(dy);
    nhUse(mode);
    return;
#else
    mode = nh_getenv("NH_SHIM_TEST_SHOP_PAYMENT_SCENE");
    if (!mode || !*mode)
        return;
    electron_test_require_runtime_gate("NH_SHIM_TEST_SHOP_PAYMENT_SCENE");
    if (strcmp(mode, "sufficient") && strcmp(mode, "insufficient"))
        panic("unsupported shop payment fixture mode: %s", mode);

    /* Build a real tended general store from an ordinary generated room.
       The merchandise below goes through pick_obj()->addtobill(), exactly as
       player-picked shop stock does; the test never toggles unpaid directly. */
    for (i = 0; i < svn.nroom; ++i) {
        if (svr.rooms[i].rtype == OROOM && svr.rooms[i].doorct > 0) {
            sroom = &svr.rooms[i];
            break;
        }
    }
    if (!sroom)
        panic("shop payment fixture could not find a room");
    sroom->rtype = SHOPBASE;
#ifdef SPECIALIZATION
    topologize(sroom, FALSE);
#else
    topologize(sroom);
#endif
    stock_room(0, sroom);
    shkp = sroom->resident;
    if (!shkp || !shkp->isshk)
        panic("shop payment fixture could not create shopkeeper");

    /* Stand on the first in-shop square adjacent to the resident so that the
       contextual action and dopay() target the same real shopkeeper. */
    for (dx = -1; dx <= 1 && !px; ++dx) {
        for (dy = -1; dy <= 1; ++dy) {
            coordxy tx = shkp->mx + dx, ty = shkp->my + dy;
            if ((!dx && !dy) || !isok(tx, ty)
                || levl[tx][ty].roomno != (sroom - svr.rooms) + ROOMOFFSET
                || !ACCESSIBLE(levl[tx][ty].typ))
                continue;
            px = tx;
            py = ty;
            break;
        }
    }
    if (!px)
        panic("shop payment fixture could not place hero by shopkeeper");
    if ((mtmp = m_at(px, py)) != 0 && mtmp != shkp)
        (void) rloc(mtmp, RLOC_NOMSG);
    oldx = u.ux;
    oldy = u.uy;
    u_on_newpos(px, py);
    newsym(oldx, oldy);
    check_special_room(FALSE);

    /* Keep the fixture's purchasing power explicit and deterministic. */
    while ((gold = findgold(gi.invent)) != 0)
        useupall(gold);
    if (strcmp(mode, "insufficient")) {
        gold = mksobj(GOLD_PIECE, FALSE, FALSE);
        if (!gold)
            panic("shop payment fixture could not create gold");
        gold->quan = 2000L;
        gold->owt = weight(gold);
        (void) addinv(gold);
    }

    otmp = mksobj_at(FOOD_RATION, u.ux, u.uy, FALSE, FALSE);
    if (!otmp || !pick_obj(otmp)->unpaid)
        panic("shop payment fixture could not bill food ration");
    otmp = mksobj_at(POT_HEALING, u.ux, u.uy, FALSE, FALSE);
    if (!otmp || !pick_obj(otmp)->unpaid)
        panic("shop payment fixture could not bill healing potion");

    for (dx = sroom->lx; dx <= sroom->hx; ++dx)
        for (dy = sroom->ly; dy <= sroom->hy; ++dy)
            levl[dx][dy].lit = levl[dx][dy].waslit = 1;
    newsym(shkp->mx, shkp->my);
    newsym(u.ux, u.uy);
    update_inventory();
#endif
}

staticfn void
maybe_setup_electron_corpse_overlay_test_scene(void)
{
    coordxy cx = 0, cy = 0, mx, my, sx, sy;
    boolean placed_corpse = FALSE;

#ifndef NH_ELECTRON_TEST_FIXTURES
    nhUse(cx);
    nhUse(cy);
    nhUse(mx);
    nhUse(my);
    nhUse(sx);
    nhUse(sy);
    nhUse(placed_corpse);
    return;
#else
    if (!nh_getenv("NH_SHIM_TEST_CORPSE_OVERLAY_SCENE"))
        return;
    electron_test_require_runtime_gate("NH_SHIM_TEST_CORPSE_OVERLAY_SCENE");

    if (find_electron_test_spot(&cx, &cy, 0, 0)) {
        (void) mkcorpstat(CORPSE, (struct monst *) 0, &mons[PM_JACKAL],
                          cx, cy, CORPSTAT_INIT);
        placed_corpse = TRUE;
        newsym(cx, cy);
    }
    if (find_electron_test_spot(&mx, &my, placed_corpse ? cx : 0,
                                placed_corpse ? cy : 0)) {
        (void) makemon(&mons[PM_JACKAL], mx, my, MM_NOGRP);
        newsym(mx, my);
    }
    if (find_electron_test_spot(&sx, &sy, placed_corpse ? cx : 0,
                                placed_corpse ? cy : 0)) {
        (void) mkcorpstat(STATUE, (struct monst *) 0, &mons[PM_JACKAL],
                          sx, sy, CORPSTAT_INIT);
        newsym(sx, sy);
    }
#endif
}

void
init_sound_disp_gamewindows(void)
{
    int menu_behavior = MENU_BEHAVE_STANDARD;

    activate_chosen_soundlib();

    if (iflags.wc_splash_screen && !flags.randomall) {
        SoundAchievement(0, sa2_splashscreen, 0);
        /* ToDo: new splash screen invocation will go here */
    } else {
        SoundAchievement(0, sa2_newgame_nosplash, 0);
    }

#ifdef CHANGE_COLOR
    /* init_nhwindows() has already been called, so before
       creating the windows, check to see if there are any
       palette entries to alter */
    change_palette();
#endif

    WIN_MESSAGE = create_nhwindow(NHW_MESSAGE);
    if (VIA_WINDOWPORT()) {
        status_initialize(FALSE);
    } else {
        WIN_STATUS = create_nhwindow(NHW_STATUS);
    }
    WIN_MAP = create_nhwindow(NHW_MAP);
    WIN_INVEN = create_nhwindow(NHW_MENU);
    if (WIN_INVEN != WIN_ERR)
        adjust_menu_promptstyle(WIN_INVEN, &iflags.menu_headings);

#ifdef TTY_PERM_INVENT
    if (WINDOWPORT(tty) && WIN_INVEN != WIN_ERR) {
        menu_behavior = MENU_BEHAVE_PERMINV;
        prepare_perminvent(WIN_INVEN);
    }
#endif
    /* in case of early quit where WIN_INVEN could be destroyed before
       ever having been used, use it here to pacify the Qt interface */
    start_menu(WIN_INVEN, menu_behavior), end_menu(WIN_INVEN, (char *) 0);

#ifdef MAC68K
    /* This _is_ the right place for this - maybe we will
     * have to split init_sound_disp_gamewindows into
     * create_gamewindows and show_gamewindows to get rid of this ifdef...
     */
    if (!strcmp(windowprocs.name, "mac"))
        SanePositions();
#endif

    /*
     * The mac port is not DEPENDENT on the order of these
     * displays, but it looks a lot better this way...
     */
#ifndef STATUS_HILITES
    display_nhwindow(WIN_STATUS, FALSE);
#endif
    display_nhwindow(WIN_MESSAGE, FALSE);
    clear_glyph_buffer();
    display_nhwindow(WIN_MAP, FALSE);
#ifdef TTY_PERM_INVENT
    if (iflags.perm_invent_pending)
        check_perm_invent_again();
#endif
}

void
newgame(void)
{
    int i;

#ifdef SYSCF
    time_t last_reroll_time;
    time_t cur_reroll_time;
    int rerolls_this_second = 0;
# if defined(BSD) && !defined(POSIX_TYPES)
#  define GET_REROLL_TIME(t) (void) time((long *) t);
# else
#  define GET_REROLL_TIME(t) (void) time(t);
# endif
#endif /* defined(SYSCF) */

    /* make sure welcome messages are given before noticing monsters */
    notice_mon_off();
    disp.botlx = TRUE;
    svc.context.ident = 2;  /* id 1 is reserved for gy.youmonst */
    svc.context.warnlevel = 1;
    svc.context.next_attrib_check = 600L; /* arbitrary first setting */
    svc.context.tribute.enabled = TRUE;   /* turn on 3.6 tributes    */
    svc.context.tribute.tributesz = sizeof(struct tribute_info);
    get_nhuuid();

    for (i = LOW_PM; i < NUMMONS; i++)
        svm.mvitals[i].mvflags = mons[i].geno & G_NOCORPSE;

    init_objects(); /* must be before u_init() */

    flags.pantheon = -1; /* role_init() will reset this */
#ifdef NH_ELECTRON_TEST_FIXTURES
    electron_test_prepare_identity_from_scenario();
#endif
    role_init();         /* must be before init_dungeons(), u_init(),
                          * and init_artifacts() */

    init_dungeons();  /* must be before u_init() to avoid rndmonst()
                       * creating odd monsters for any tins and eggs
                       * in hero's initial inventory */
    init_artifacts(); /* before u_init() in case $WIZKIT specifies
                       * any artifacts */
    u_init_misc();

    l_nhcore_init();  /* create a Lua state that lasts until end of game */
    reset_glyphmap(gm_newgame);
#ifndef NO_SIGNAL
    (void) signal(SIGINT, (SIG_RET_TYPE) done1);
#endif
#ifdef NEWS
    if (iflags.news)
        display_file(NEWS, FALSE);
#endif
    /* quest_init();  --  Now part of role_init() */

    mklev();
    u_on_upstairs();
    vision_reset();          /* set up internals for level (after mklev) */
    check_special_room(FALSE);

    if (MON_AT(u.ux, u.uy))
        mnexto(m_at(u.ux, u.uy), RLOC_NOMSG);
    (void) makedog();
    u_init_inventory_attrs();
    maybe_setup_electron_json_test_scenario();
    maybe_setup_electron_pickup_test_pile();
    maybe_setup_electron_container_context_test_scene();
    maybe_setup_electron_container_transfer_test_scene();
    maybe_setup_electron_locked_door_test_scene();
    maybe_setup_electron_corpse_overlay_test_scene();
    maybe_setup_electron_shop_payment_test_scene();

    docrt();
    flush_screen(1);
    bot();

#ifdef SYSCF
    GET_REROLL_TIME(&last_reroll_time);
#endif

    while (u.uroleplay.reroll && reroll_menu()) {
#ifdef SYSCF
        if (sysopt.maxrerollrate > 0) {
        check_reroll_time:
            GET_REROLL_TIME(&cur_reroll_time);

            if (last_reroll_time != cur_reroll_time) {
                last_reroll_time = cur_reroll_time;
                rerolls_this_second = 1;
            } else {
                if (rerolls_this_second >= sysopt.maxrerollrate) {
                    if (!paranoid_query(TRUE, "Continue rerolling?"))
                        break;
                    goto check_reroll_time;
                }
                ++rerolls_this_second;
            }
        }
#endif

        ++u.uroleplay.numrerolls;
        u_init_inventory_attrs();
        bot();
    }
    u_init_skills_discoveries();

    if (wizard) {
        read_wizkit();
        obj_delivery(FALSE); /* finish wizkit */
    }

    if (flags.legacy) {
        com_pager(u.uroleplay.pauper ? "pauper_legacy" : "legacy");
    }

    urealtime.realtime = 0L;
    urealtime.start_timing = getnow();
#ifdef INSURANCE
    save_currentstate();
#endif
    program_state.something_worth_saving++; /* useful data now exists */

    /* Success! */
    welcome(TRUE);
    notice_mon_on(); /* now we can notice monsters */
    if (a11y.glyph_updates)
        (void) dolookaround();
    else
        notice_all_mons(TRUE);
    return;
}

/* show "welcome [back] to NetHack" message at program startup */
void
welcome(boolean new_game) /* false => restoring an old game */
{
    char buf[BUFSZ];
    boolean currentgend = Upolyd ? u.mfemale : flags.female,
            adrift = (u.ualign.type != u.ualignbase[A_CURRENT]);

    l_nhcore_call(new_game ? NHCORE_START_NEW_GAME : NHCORE_RESTORE_OLD_GAME);

    /* skip "welcome back" if restoring a doomed character */
    if (!new_game && Upolyd && ugenocided()) {
        /* death via self-genocide is pending */
        pline("You're back, but you still feel %s inside.", udeadinside());
        return;
    }

    if (Hallucination)
        pline("NetHack is filmed in front of an undead studio audience.");

    /*
     * The "welcome back" message always describes your innate form
     * even when polymorphed or wearing a helm of opposite alignment.
     * Alignment is shown unconditionally for new games; for restores
     * it's only shown if it has changed from its original value.
     * Sex is shown for new games except when it is redundant; for
     * restores it's only shown if different from its original value.
     */
    *buf = '\0';
#if 0
    if (new_game || u.ualignbase[A_ORIGINAL] != u.ualignbase[A_CURRENT])
        Sprintf(eos(buf), " %s", align_str(u.ualignbase[A_ORIGINAL]));
#else
    /*
     * 2026-04-24
     * GitHub issue https://github.com/NetHack/NetHack/issues/537
     * "Judging by the comment above, it should display your new alignment
     *  if it was changed, so align_str(u.ualignbase[A_CURRENT]) would
     *  probably be more appropriate. This won't affect the new game message."
     *
     * That is followed by a suggestion to revisit the matter (paraphrased):
     * "That's actually intentional; the comment oversimplifies.
     *  When it was implemented, it may have been the only way to tell that
     *  you had converted alignment. Now ^X mentions your starting alignment
     *  if base alignment has been changed, so revisiting this welcome back
     *  message."
     */
    if (new_game || u.ualignbase[A_ORIGINAL] != u.ualignbase[A_CURRENT] || adrift)
        Sprintf(eos(buf), " %s%s",
                adrift ? "adrift " : "",
                adrift ? align_str(u.ualign.type)
                       : align_str(u.ualignbase[A_CURRENT]));
#endif
    if (!gu.urole.name.f
        && (new_game
            ? (gu.urole.allow & ROLE_GENDMASK) == (ROLE_MALE | ROLE_FEMALE)
            : currentgend != flags.initgend))
        Sprintf(eos(buf), " %s", genders[currentgend].adj);
    Sprintf(eos(buf), " %s %s", gu.urace.adj,
            (currentgend && gu.urole.name.f) ? gu.urole.name.f
                                             : gu.urole.name.m);

    pline(new_game ? "%s %s, welcome to NetHack!  You are a%s."
                   : "%s %s, the%s, welcome back to NetHack!",
          Hello((struct monst *) 0), svp.plname, buf);

    if (new_game) {
        /* guarantee that 'major' event category is never empty */
        livelog_printf(LL_ACHIEVE, "%s the%s entered the dungeon",
                       svp.plname, buf);
    } else {
        /* if restoring in Gehennom, give same hot/smoky message as when
           first entering it */
        hellish_smoke_mesg();
        /* remind player of the level annotation, like in goto_level() */
        print_level_annotation();
    }
}

#ifdef POSITIONBAR
staticfn void
do_positionbar(void)
{
    /* FIXME: this will break if any coordinate is too big for (char);
       the sys/msdos/vid*.c code uses (unsigned char) which is less
       vulnerable but not guaranteed to be able to hold coordxy values;
       also, there doesn't appear to be any need for this to be static,
       nor to contain pairs of (> or <) and x; it could just be a full
       line of spaces and > or < characters with update_positionbar()
       revised to reconstruct the x values for non-space characters */
    static char pbar[COLNO];
    char *p;
    stairway *stway;
    coordxy x, y;
    int glyph, symbol;

    p = pbar;
    /* TODO: use the same method as getpos() so objects don't cover stairs */
    /* FIXME: traversing 'stairs' list ignores mimics that pose as stairs */
    for (stway = gs.stairs; stway; stway = stway->next) {
        x = stway->sx;
        y = stway->sy;
        glyph = levl[x][y].glyph;
        symbol = glyph_to_cmap(glyph);

        if (is_cmap_stairs(symbol)) {
            *p++ = (stway->up ? '<' : '>');
            *p++ = (char) x;
        }
     }

    /* hero location */
    if (u.ux) {
        *p++ = '@';
        *p++ = u.ux;
    }
    /* fence post */
    *p = 0;

    update_positionbar(pbar);
}
#endif

staticfn void
interrupt_multi(const char *msg)
{
    if (gm.multi > 0 && !svc.context.travel && !svc.context.run) {
        nomul(0);
        if (flags.verbose && msg)
            Norep("%s", msg);
    }
}

/* convert from time_t to number of seconds */
long
timet_to_seconds(time_t ttim)
{
    /* for Unix-based and Posix-compliant systems, a cast to 'long' would
       suffice but the C Standard doesn't require time_t to be that simple */
    return timet_delta(ttim, (time_t) 0);
}

/* calculate the difference in seconds between two time_t values */
long
timet_delta(time_t etim, time_t stim) /* end and start times */
{
    /* difftime() is a STDC routine which returns the number of seconds
       between two time_t values as a 'double' */
    return (long) difftime(etim, stim);
}

/*allmain.c*/
