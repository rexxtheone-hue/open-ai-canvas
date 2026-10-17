import { forwardRef, type ForwardRefExoticComponent, type RefAttributes, type SVGAttributes } from "react";
import { ArrangeHorizontal as IconsaxArrangeHorizontal, Book as IconsaxBook, Book1 as IconsaxBook1, Box as IconsaxBox, Briefcase as IconsaxBriefcase, Building as IconsaxBuilding, Calendar as IconsaxCalendar, Camera as IconsaxCamera, Category as IconsaxCategory, ColorSwatch as IconsaxColorSwatch, Convert as IconsaxConvert, Copy as IconsaxCopy, Crop as IconsaxCrop, Crown1 as IconsaxCrown1, Discover as IconsaxDiscover, DocumentText1 as IconsaxDocumentText1, DocumentUpload as IconsaxDocumentUpload, Edit2 as IconsaxEdit2, Element3 as IconsaxElement3, Element4 as IconsaxElement4, EmojiHappy as IconsaxEmojiHappy, Filter as IconsaxFilter, Flash as IconsaxFlash, Folder2 as IconsaxFolder2, FolderAdd as IconsaxFolderAdd, FolderMinus as IconsaxFolderMinus, FolderOpen as IconsaxFolderOpen, Forward as IconsaxForward, Gallery as IconsaxGallery, GalleryAdd as IconsaxGalleryAdd, GalleryExport as IconsaxGalleryExport, GalleryImport as IconsaxGalleryImport, Gift as IconsaxGift, Global as IconsaxGlobal, Happyemoji as IconsaxHappyemoji, Headphone as IconsaxHeadphone, Heart as IconsaxHeart, Home2 as IconsaxHome2, Image as IconsaxImage, Import as IconsaxImport, InfoCircle as IconsaxInfoCircle, Lamp as IconsaxLamp, Layer as IconsaxLayer, Link1 as IconsaxLink1, Location as IconsaxLocation, MagicStar as IconsaxMagicStar, Magicpen as IconsaxMagicpen, Maximize4 as IconsaxMaximize4, MessageAdd1 as IconsaxMessageAdd1, MessageQuestion as IconsaxMessageQuestion, MessageText1 as IconsaxMessageText1, Microphone as IconsaxMicrophone, Microphone2 as IconsaxMicrophone2, Monitor as IconsaxMonitor, Music as IconsaxMusic, Paperclip2 as IconsaxPaperclip2, Pause as IconsaxPause, People as IconsaxPeople, Play as IconsaxPlay, Record as IconsaxRecord, Refresh2 as IconsaxRefresh2, RotateLeft as IconsaxRotateLeft, RotateRight as IconsaxRotateRight, Routing2 as IconsaxRouting2, Scan as IconsaxScan, SearchNormal1 as IconsaxSearchNormal1, SearchZoomIn as IconsaxSearchZoomIn, Setting4 as IconsaxSetting4, Share as IconsaxShare, Shop as IconsaxShop, SidebarLeft as IconsaxSidebarLeft, Sound as IconsaxSound, Speaker as IconsaxSpeaker, Star1 as IconsaxStar1, Stop as IconsaxStop, Sun1 as IconsaxSun1, Tag2 as IconsaxTag2, Text as IconsaxText, Translate as IconsaxTranslate, Trash as IconsaxTrash, Tree as IconsaxTree, User as IconsaxUser, UserAdd as IconsaxUserAdd, UserEdit as IconsaxUserEdit, UserTick as IconsaxUserTick, Video as IconsaxVideo, VideoPlay as IconsaxVideoPlay, VideoSquare as IconsaxVideoSquare, VideoVertical as IconsaxVideoVertical, VolumeHigh as IconsaxVolumeHigh, VideoPlay as IconsaxFillVideoPlay, Gallery as IconsaxFillGallery, Sound as IconsaxFillSound, Happyemoji as IconsaxFillHappyemoji, Global as IconsaxFillGlobal, MessageText1 as IconsaxFillMessageText1, VideoSquare as IconsaxFillVideoSquare, Designtools as IconsaxFillDesigntools, ColorSwatch as IconsaxFillColorSwatch, type Icon as IconsaxIcon } from "iconsax-react";

/**
 * AI Studio 的图标：和 OpenArt 一样用 Iconsax——默认 Outline（粗线条），分类、对话/工具切换、品牌格子用 Bold 实心款（*Fill）；
 * 箭头、加号、关闭、列表/网格用 Material Symbols Rounded 实心款。
 * 导出名沿用原来的 Lucide 名称，页面只需要换导入路径。
 * Iconsax（iconsax-react，MIT）；Material Symbols（@material-symbols/svg-400，Apache-2.0，路径由 scripts 从安装包生成）。
 */
export type StudioIconProps = SVGAttributes<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string; absoluteStrokeWidth?: boolean };
export type StudioIcon = ForwardRefExoticComponent<StudioIconProps & RefAttributes<SVGSVGElement>>;
/** 兼容原来 lucide-react 的 LucideIcon 类型名。 */
export type LucideIcon = StudioIcon;

function iconsax(Component: IconsaxIcon, name: string, variant: "Outline" | "Bold" = "Outline"): StudioIcon {
    const Icon = forwardRef<SVGSVGElement, StudioIconProps>(({ size = 24, strokeWidth: _strokeWidth, absoluteStrokeWidth: _absolute, ...rest }, ref) => (
        <Component {...rest} ref={ref} variant={variant} color="currentColor" size={size} data-icon={name} />
    ));
    Icon.displayName = name;
    return Icon;
}

function material(path: string, name: string): StudioIcon {
    const Icon = forwardRef<SVGSVGElement, StudioIconProps>(({ size = 24, strokeWidth: _strokeWidth, absoluteStrokeWidth: _absolute, ...rest }, ref) => (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" data-icon={name} {...rest} ref={ref}>
            <path d={path} />
        </svg>
    ));
    Icon.displayName = name;
    return Icon;
}

const MATERIAL_ADD = "M450-450H230q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h220v-220q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v220h220q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H510v220q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63-8.5-8.62-8.5-21.37v-220Z";
const MATERIAL_ARROW_BACK = "m274-450 227 227q9 9 9 21t-9 21q-9 9-21 9t-21-9L181-459q-5-5-7-10t-2-11q0-6 2-11t7-10l278-278q9-9 21-9t21 9q9 9 9 21t-9 21L274-510h496q13 0 21.5 8.5T800-480q0 13-8.5 21.5T770-450H274Z";
const MATERIAL_ARROW_FORWARD = "M686-450H190q-13 0-21.5-8.5T160-480q0-13 8.5-21.5T190-510h496L459-737q-9-9-9-21t9-21q9-9 21-9t21 9l278 278q5 5 7 10t2 11q0 6-2 11t-7 10L501-181q-9 9-21 9t-21-9q-9-9-9-21t9-21l227-227Z";
const MATERIAL_ARROW_UPWARD_ALT = "M452-644 303-498q-9 9-21 8.5t-21-9.5q-9-9-9-21t9-21l199-199q9-9 21-9t21 9l199 199q9 9 9 21t-9 21q-9 9-21 9t-21-9L512-646v372q0 13-8.5 21.5T482-244q-13 0-21.5-8.5T452-274v-370Z";
const MATERIAL_CHECK = "m378-332 363-363q9-9 21.5-9t21.5 9q9 9 9 21.5t-9 21.5L399-267q-9 9-21 9t-21-9L175-449q-9-9-8.5-21.5T176-492q9-9 21.5-9t21.5 9l159 160Z";
const MATERIAL_CLOSE = "M480-438 270-228q-9 9-21 9t-21-9q-9-9-9-21t9-21l210-210-210-210q-9-9-9-21t9-21q9-9 21-9t21 9l210 210 210-210q9-9 21-9t21 9q9 9 9 21t-9 21L522-480l210 210q9 9 9 21t-9 21q-9 9-21 9t-21-9L480-438Z";
const MATERIAL_GRID_VIEW = "M180-510q-24.75 0-42.37-17.63Q120-545.25 120-570v-210q0-24.75 17.63-42.38Q155.25-840 180-840h210q24.75 0 42.38 17.62Q450-804.75 450-780v210q0 24.75-17.62 42.37Q414.75-510 390-510H180Zm0 390q-24.75 0-42.37-17.63Q120-155.25 120-180v-210q0-24.75 17.63-42.38Q155.25-450 180-450h210q24.75 0 42.38 17.62Q450-414.75 450-390v210q0 24.75-17.62 42.37Q414.75-120 390-120H180Zm390-390q-24.75 0-42.37-17.63Q510-545.25 510-570v-210q0-24.75 17.63-42.38Q545.25-840 570-840h210q24.75 0 42.38 17.62Q840-804.75 840-780v210q0 24.75-17.62 42.37Q804.75-510 780-510H570Zm0 390q-24.75 0-42.37-17.63Q510-155.25 510-180v-210q0-24.75 17.63-42.38Q545.25-450 570-450h210q24.75 0 42.38 17.62Q840-414.75 840-390v210q0 24.75-17.62 42.37Q804.75-120 780-120H570Z";
const MATERIAL_HELP = "M511-258.03q11-11.03 11-27T510.97-312q-11.03-11-27-11T457-311.97q-11 11.03-11 27T457.03-258q11.03 11 27 11T511-258.03ZM480.27-80q-82.74 0-155.5-31.5Q252-143 197.5-197.5t-86-127.34Q80-397.68 80-480.5t31.5-155.66Q143-709 197.5-763t127.34-85.5Q397.68-880 480.5-880t155.66 31.5Q709-817 763-763t85.5 127Q880-563 880-480.27q0 82.74-31.5 155.5Q817-252 763-197.68q-54 54.31-127 86Q563-80 480.27-80Zm2.5-580Q513-660 536-641.5q23 18.5 23 47.2 0 26.3-15.65 45.73Q527.7-529.14 508-512q-23 19-40 42.38-17 23.39-17 52.62 0 11 8.4 17.5T479-393q12 0 19.88-8 7.87-8 10.12-20 3-21 16-38t30.23-30.78Q580-510 596-537q16-27 16-58.61 0-50.39-37.5-83.89T485.55-713Q450-713 417-698t-54 44q-7 10-6.5 21.5t9.47 18.5q11.41 8 23.65 5 12.23-3 20.38-14 12.75-17.9 31.88-27.45Q461-660 482.77-660Z";
const MATERIAL_KEEP = "M634-780v332l77 68q5 5 7 10.6 2 5.59 2 11.56v17.16q0 12.68-8.62 21.18-8.63 8.5-21.38 8.5H510v236q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63Q450-62.25 450-75v-236H270q-12.75 0-21.37-8.58-8.63-8.59-8.63-21.28v-17.17q0-5.97 2-11.47 2-5.5 7-10.5l71-68v-332h-20q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h354q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5h-20Z";
const MATERIAL_KEYBOARD_ARROW_DOWN = "M469-358q-5-2-10-7L261-563q-9-9-8.5-21.5T262-606q9-9 21.5-9t21.5 9l175 176 176-176q9-9 21-8.5t21 9.5q9 9 9 21.5t-9 21.5L501-365q-5 5-10 7t-11 2q-6 0-11-2Z";
const MATERIAL_KEYBOARD_ARROW_LEFT = "m406-481 177 177q9 9 8.5 21t-9.5 21q-9 9-21.5 9t-21.5-9L341-460q-5-5-7-10t-2-11q0-6 2-11t7-10l199-199q9-9 21.5-9t21.5 9q9 9 9 21.5t-9 21.5L406-481Z";
const MATERIAL_KEYBOARD_ARROW_RIGHT = "M530-481 353-658q-9-9-8.5-21t9.5-21q9-9 21.5-9t21.5 9l198 198q5 5 7 10t2 11q0 6-2 11t-7 10L396-261q-9 9-21 8.5t-21-9.5q-9-9-9-21.5t9-21.5l176-176Z";
const MATERIAL_NORTH_WEST = "M260-658v264q0 13-8.5 21.5T230-364q-13 0-21.5-8.5T200-394v-336q0-13 8.5-21.5T230-760h336q13 0 21.5 8.5T596-730q0 13-8.5 21.5T566-700H302l477 477q9 9 9 21t-9 21q-9 9-21 9t-21-9L260-658Z";
const MATERIAL_PROGRESS_ACTIVITY = "M323-111q-73-31-127-85t-85-127q-31-73-31-157t31-157q31-73 85-127t127-85q73-31 157-31 12 0 21 9t9 21q0 12-9 21t-21 9q-141 0-240.5 99.5T140-480q0 141 99.5 240.5T480-140q141 0 240.5-99.5T820-480q0-12 9-21t21-9q12 0 21 9t9 21q0 84-31 157t-85 127q-54 54-127 85T480-80q-84 0-157-31Z";
const MATERIAL_VIEW_AGENDA = "M180-510q-24 0-42-18t-18-42v-210q0-24 18-42t42-18h600q24 0 42 18t18 42v210q0 24-18 42t-42 18H180Zm0 390q-24 0-42-18t-18-42v-210q0-24 18-42t42-18h600q24 0 42 18t18 42v210q0 24-18 42t-42 18H180Z";

export const ArrowLeft = material(MATERIAL_ARROW_BACK, "ArrowLeft");
export const ArrowLeftRight = iconsax(IconsaxArrangeHorizontal, "ArrowLeftRight");
export const ArrowRight = material(MATERIAL_ARROW_FORWARD, "ArrowRight");
export const ArrowUp = material(MATERIAL_ARROW_UPWARD_ALT, "ArrowUp");
export const ArrowUpLeft = material(MATERIAL_NORTH_WEST, "ArrowUpLeft");
export const AudioLines = iconsax(IconsaxSound, "AudioLines");
export const AudioWaveform = iconsax(IconsaxSound, "AudioWaveform");
export const BookOpen = iconsax(IconsaxBook1, "BookOpen");
export const Box = iconsax(IconsaxBox, "Box");
export const Briefcase = iconsax(IconsaxBriefcase, "Briefcase");
export const Building2 = iconsax(IconsaxBuilding, "Building2");
export const CalendarDays = iconsax(IconsaxCalendar, "CalendarDays");
export const Camera = iconsax(IconsaxCamera, "Camera");
export const Check = material(MATERIAL_CHECK, "Check");
export const ChevronDown = material(MATERIAL_KEYBOARD_ARROW_DOWN, "ChevronDown");
export const ChevronLeft = material(MATERIAL_KEYBOARD_ARROW_LEFT, "ChevronLeft");
export const ChevronRight = material(MATERIAL_KEYBOARD_ARROW_RIGHT, "ChevronRight");
export const Circle = iconsax(IconsaxRecord, "Circle");
export const CircleHelp = material(MATERIAL_HELP, "CircleHelp");
export const Clapperboard = iconsax(IconsaxVideoPlay, "Clapperboard");
export const Compass = iconsax(IconsaxDiscover, "Compass");
export const Copy = iconsax(IconsaxCopy, "Copy");
export const Crop = iconsax(IconsaxCrop, "Crop");
export const Crown = iconsax(IconsaxCrown1, "Crown");
export const Download = iconsax(IconsaxImport, "Download");
export const Earth = iconsax(IconsaxGlobal, "Earth");
export const Expand = iconsax(IconsaxMaximize4, "Expand");
export const FastForward = iconsax(IconsaxForward, "FastForward");
export const FileText = iconsax(IconsaxDocumentText1, "FileText");
export const Film = iconsax(IconsaxVideoSquare, "Film");
export const Filter = iconsax(IconsaxFilter, "Filter");
export const Flame = iconsax(IconsaxFlash, "Flame");
export const Folder = iconsax(IconsaxFolder2, "Folder");
export const FolderInput = iconsax(IconsaxFolder2, "FolderInput");
export const FolderMinus = iconsax(IconsaxFolderMinus, "FolderMinus");
export const FolderOpen = iconsax(IconsaxFolderOpen, "FolderOpen");
export const FolderPlus = iconsax(IconsaxFolderAdd, "FolderPlus");
export const Gift = iconsax(IconsaxGift, "Gift");
export const Globe = iconsax(IconsaxGlobal, "Globe");
export const Grid2x2 = iconsax(IconsaxElement3, "Grid2x2");
export const Grid3x3 = iconsax(IconsaxCategory, "Grid3x3");
export const Headset = iconsax(IconsaxHeadphone, "Headset");
export const Heart = iconsax(IconsaxHeart, "Heart");
export const Home = iconsax(IconsaxHome2, "Home");
export const Image = iconsax(IconsaxGallery, "Image");
export const ImagePlay = iconsax(IconsaxGalleryExport, "ImagePlay");
export const ImagePlus = iconsax(IconsaxGalleryAdd, "ImagePlus");
export const ImageUp = iconsax(IconsaxGalleryImport, "ImageUp");
export const Info = iconsax(IconsaxInfoCircle, "Info");
export const Languages = iconsax(IconsaxTranslate, "Languages");
export const Layers = iconsax(IconsaxLayer, "Layers");
export const LayoutGrid = material(MATERIAL_GRID_VIEW, "LayoutGrid");
export const LayoutTemplate = iconsax(IconsaxElement4, "LayoutTemplate");
export const Library = iconsax(IconsaxBook, "Library");
export const Lightbulb = iconsax(IconsaxLamp, "Lightbulb");
export const Link = iconsax(IconsaxLink1, "Link");
export const List = material(MATERIAL_VIEW_AGENDA, "List");
export const ListVideo = iconsax(IconsaxVideoVertical, "ListVideo");
export const Loader2 = material(MATERIAL_PROGRESS_ACTIVITY, "Loader2");
export const MapPin = iconsax(IconsaxLocation, "MapPin");
export const Maximize2 = iconsax(IconsaxMaximize4, "Maximize2");
export const Megaphone = iconsax(IconsaxVolumeHigh, "Megaphone");
export const MessageSquarePlus = iconsax(IconsaxMessageAdd1, "MessageSquarePlus");
export const MessageSquareText = iconsax(IconsaxMessageText1, "MessageSquareText");
export const MessageSquareWarning = iconsax(IconsaxMessageQuestion, "MessageSquareWarning");
export const Mic = iconsax(IconsaxMicrophone2, "Mic");
export const MicVocal = iconsax(IconsaxMicrophone, "MicVocal");
export const MonitorUp = iconsax(IconsaxMonitor, "MonitorUp");
export const Mountain = iconsax(IconsaxTree, "Mountain");
export const MountainSnow = iconsax(IconsaxTree, "MountainSnow");
export const Music = iconsax(IconsaxMusic, "Music");
export const Orbit = iconsax(IconsaxRotateRight, "Orbit");
export const Palette = iconsax(IconsaxColorSwatch, "Palette");
export const PanelLeft = iconsax(IconsaxSidebarLeft, "PanelLeft");
export const Paperclip = iconsax(IconsaxPaperclip2, "Paperclip");
export const Pause = iconsax(IconsaxPause, "Pause");
export const PenLine = iconsax(IconsaxEdit2, "PenLine");
export const Pencil = iconsax(IconsaxEdit2, "Pencil");
export const PersonStanding = iconsax(IconsaxUser, "PersonStanding");
export const Pin = material(MATERIAL_KEEP, "Pin");
export const Play = iconsax(IconsaxPlay, "Play");
export const Plus = material(MATERIAL_ADD, "Plus");
export const RefreshCw = iconsax(IconsaxRefresh2, "RefreshCw");
export const Replace = iconsax(IconsaxConvert, "Replace");
export const Rotate3d = iconsax(IconsaxRotateLeft, "Rotate3d");
export const RotateCcw = iconsax(IconsaxRotateLeft, "RotateCcw");
export const ScanFace = iconsax(IconsaxEmojiHappy, "ScanFace");
export const ScanText = iconsax(IconsaxScan, "ScanText");
export const Search = iconsax(IconsaxSearchNormal1, "Search");
export const Share2 = iconsax(IconsaxShare, "Share2");
export const SlidersHorizontal = iconsax(IconsaxSetting4, "SlidersHorizontal");
export const Sparkles = iconsax(IconsaxMagicStar, "Sparkles");
export const Speaker = iconsax(IconsaxSpeaker, "Speaker");
export const Square = iconsax(IconsaxStop, "Square");
export const Star = iconsax(IconsaxStar1, "Star");
export const Store = iconsax(IconsaxShop, "Store");
export const SunMedium = iconsax(IconsaxSun1, "SunMedium");
export const Tag = iconsax(IconsaxTag2, "Tag");
export const Trash2 = iconsax(IconsaxTrash, "Trash2");
export const Type = iconsax(IconsaxText, "Type");
export const Upload = iconsax(IconsaxDocumentUpload, "Upload");
export const UserCheck = iconsax(IconsaxUserTick, "UserCheck");
export const UserPen = iconsax(IconsaxUserEdit, "UserPen");
export const UserPlus = iconsax(IconsaxUserAdd, "UserPlus");
export const UserRound = iconsax(IconsaxHappyemoji, "UserRound");
export const Users = iconsax(IconsaxPeople, "Users");
export const Video = iconsax(IconsaxVideo, "Video");
export const Volume2 = iconsax(IconsaxVolumeHigh, "Volume2");
export const Wallpaper = iconsax(IconsaxImage, "Wallpaper");
export const Wand2 = iconsax(IconsaxMagicpen, "Wand2");
export const WandSparkles = iconsax(IconsaxMagicpen, "WandSparkles");
export const Waypoints = iconsax(IconsaxRouting2, "Waypoints");
export const X = material(MATERIAL_CLOSE, "X");
export const ZoomIn = iconsax(IconsaxSearchZoomIn, "ZoomIn");
export const ImageIcon = Image;
export const VideoFill = iconsax(IconsaxFillVideoPlay, "VideoFill", "Bold");
export const ImageFill = iconsax(IconsaxFillGallery, "ImageFill", "Bold");
export const AudioFill = iconsax(IconsaxFillSound, "AudioFill", "Bold");
export const CharacterFill = iconsax(IconsaxFillHappyemoji, "CharacterFill", "Bold");
export const WorldFill = iconsax(IconsaxFillGlobal, "WorldFill", "Bold");
export const ChatFill = iconsax(IconsaxFillMessageText1, "ChatFill", "Bold");
export const DirectorFill = iconsax(IconsaxFillVideoSquare, "DirectorFill", "Bold");
export const ToolsFill = iconsax(IconsaxFillDesigntools, "ToolsFill", "Bold");
export const BrandFill = iconsax(IconsaxFillColorSwatch, "BrandFill", "Bold");
