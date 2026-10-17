import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, UserRound } from "./studio-icons";
import { Link } from "react-router";

import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { listStudioCharacters, type StudioCharacter } from "@/services/api/studio-agents";
import { studioCharacterChatAttachment, studioCharacterCover } from "./studio-characters";
import type { StudioChatAttachment } from "./studio-chat";

/** 「角色与世界」资产库里的全部素材（角色、物体、背景、风格）。 */
export function useStudioAssets(enabled = true) {
    return useQuery({ queryKey: ["studio", "characters"], queryFn: async () => (await listStudioCharacters()).items, enabled });
}

/** 只要角色：对话、导演按人物使用。 */
export function useStudioCharacters(enabled = true) {
    return useQuery({ queryKey: ["studio", "characters"], queryFn: async () => (await listStudioCharacters()).items, enabled, select: (items) => items.filter((item) => (item.kind || "character") === "character") });
}

/** 角色多选网格：对话、导演和工具页共用。 */
export function StudioCharacterGrid({ characters, selected, onToggle }: { characters: StudioCharacter[]; selected: string[]; onToggle: (character: StudioCharacter) => void }) {
    return (
        <div className="studio-character-picker">
            {characters.map((character) => {
                const cover = studioCharacterCover(character);
                const pressed = selected.includes(character.id);
                return (
                    <button key={character.id} type="button" aria-pressed={pressed} title={character.description || character.name} onClick={() => onToggle(character)}>
                        {cover ? <img src={cover} alt="" loading="lazy" /> : <UserRound aria-hidden />}
                        <span>{character.name}</span>
                        {pressed ? <Check className="studio-pick-check" aria-hidden /> : null}
                    </button>
                );
            })}
        </div>
    );
}

/** 从角色库挑角色，主图作为对话素材。没有形象图的角色不能作为素材。 */
export function StudioCharacterPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (items: StudioChatAttachment[]) => void }) {
    const query = useStudioCharacters(open);
    const characters = (query.data || []).filter((item) => item.imageResourceIds.length);
    const [selected, setSelected] = useState<string[]>([]);
    const confirm = () => {
        const picked = characters.filter((item) => selected.includes(item.id)).map(studioCharacterChatAttachment).filter((item): item is StudioChatAttachment => Boolean(item));
        setSelected([]);
        onPick(picked);
    };
    return (
        <AppModal rootClassName="studio-modal" open={open} title="从角色库选择" okText="加入" cancelText="取消" okButtonProps={{ disabled: !selected.length }} onOk={confirm} onCancel={() => { setSelected([]); onClose(); }}>
            <div className="studio-popup">
                {query.isLoading ? <p className="studio-hint">加载中…</p> : characters.length ? (
                    <StudioCharacterGrid characters={characters} selected={selected} onToggle={(character) => setSelected((list) => (list.includes(character.id) ? list.filter((id) => id !== character.id) : [...list, character.id]))} />
                ) : (
                    <p className="studio-hint">还没有带形象图的角色，<Link to="/studio/characters?create=1" onClick={onClose}>去建一个</Link>。</p>
                )}
            </div>
        </AppModal>
    );
}
