import { forwardRef, type ForwardRefExoticComponent, type RefAttributes, type SVGAttributes } from "react";
import {
    ArrowLeft as IconoirArrowLeft,
    ArrowRight as IconoirArrowRight,
    ArrowSeparate as IconoirArrowSeparate,
    ArrowUp as IconoirArrowUp,
    ArrowUpLeft as IconoirArrowUpLeft,
    Attachment as IconoirAttachment,
    Book as IconoirBook,
    BookStack as IconoirBookStack,
    Box3dPoint as IconoirBox3dPoint,
    Building as IconoirBuilding,
    Calendar as IconoirCalendar,
    Camera as IconoirCamera,
    ChatBubble as IconoirChatBubble,
    ChatBubbleWarning as IconoirChatBubbleWarning,
    ChatLines as IconoirChatLines,
    ChatPlusIn as IconoirChatPlusIn,
    Check as IconoirCheck,
    Circle as IconoirCircle,
    Compass as IconoirCompass,
    Copy as IconoirCopy,
    Crop as IconoirCrop,
    Crown as IconoirCrown,
    Download as IconoirDownload,
    EditPencil as IconoirEditPencil,
    Expand as IconoirExpand,
    FaceId as IconoirFaceId,
    Filter as IconoirFilter,
    FireFlame as IconoirFireFlame,
    Folder as IconoirFolder,
    FolderMinus as IconoirFolderMinus,
    FolderPlus as IconoirFolderPlus,
    Forward as IconoirForward,
    Gift as IconoirGift,
    Globe as IconoirGlobe,
    Group as IconoirGroup,
    Hd as IconoirHd,
    Headset as IconoirHeadset,
    Heart as IconoirHeart,
    HelpCircle as IconoirHelpCircle,
    Home as IconoirHome,
    InfoCircle as IconoirInfoCircle,
    Label as IconoirLabel,
    Language as IconoirLanguage,
    LightBulb as IconoirLightBulb,
    Link as IconoirLink,
    List as IconoirList,
    MagicWand as IconoirMagicWand,
    MapPin as IconoirMapPin,
    MediaImage as IconoirMediaImage,
    MediaImageList as IconoirMediaImageList,
    MediaImagePlus as IconoirMediaImagePlus,
    MediaVideo as IconoirMediaVideo,
    MediaVideoList as IconoirMediaVideoList,
    Megaphone as IconoirMegaphone,
    Microphone as IconoirMicrophone,
    MicrophoneSpeaking as IconoirMicrophoneSpeaking,
    Movie as IconoirMovie,
    MusicDoubleNote as IconoirMusicDoubleNote,
    NavArrowDown as IconoirNavArrowDown,
    NavArrowLeft as IconoirNavArrowLeft,
    NavArrowRight as IconoirNavArrowRight,
    Network as IconoirNetwork,
    OpenBook as IconoirOpenBook,
    Page as IconoirPage,
    Palette as IconoirPalette,
    Pause as IconoirPause,
    Pin as IconoirPin,
    Planet as IconoirPlanet,
    Play as IconoirPlay,
    Plus as IconoirPlus,
    Refresh as IconoirRefresh,
    RefreshDouble as IconoirRefreshDouble,
    Repeat as IconoirRepeat,
    RotateCameraLeft as IconoirRotateCameraLeft,
    RotateCameraRight as IconoirRotateCameraRight,
    Running as IconoirRunning,
    ScanQrCode as IconoirScanQrCode,
    Search as IconoirSearch,
    Settings as IconoirSettings,
    ShareAndroid as IconoirShareAndroid,
    Shop as IconoirShop,
    SidebarCollapse as IconoirSidebarCollapse,
    SoundHigh as IconoirSoundHigh,
    Sparks as IconoirSparks,
    Square as IconoirSquare,
    Star as IconoirStar,
    Suitcase as IconoirSuitcase,
    SunLight as IconoirSunLight,
    Text as IconoirText,
    Trash as IconoirTrash,
    Undo as IconoirUndo,
    Upload as IconoirUpload,
    User as IconoirUser,
    UserBadgeCheck as IconoirUserBadgeCheck,
    UserCircle as IconoirUserCircle,
    UserPlus as IconoirUserPlus,
    VideoCamera as IconoirVideoCamera,
    ViewColumns3 as IconoirViewColumns3,
    ViewGrid as IconoirViewGrid,
    Voice as IconoirVoice,
    Xmark as IconoirXmark,
    ZoomIn as IconoirZoomIn,
} from "iconoir-react";

/**
 * AI Studio 的图标：参考 Higgsfield——24×24、1.5 线宽的细线条图标，颜色跟随文字。
 * 用 Iconoir（iconoir-react，MIT）。导出名沿用原来的 Lucide 名称，页面只需要换导入路径。
 */
export type StudioIconProps = SVGAttributes<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string; absoluteStrokeWidth?: boolean };
export type StudioIcon = ForwardRefExoticComponent<StudioIconProps & RefAttributes<SVGSVGElement>>;
/** 兼容原来 lucide-react 的 LucideIcon 类型名。 */
export type LucideIcon = StudioIcon;

type IconoirComponent = ForwardRefExoticComponent<SVGAttributes<SVGSVGElement> & RefAttributes<SVGSVGElement>>;

function iconoir(Component: IconoirComponent, name: string): StudioIcon {
    const Icon = forwardRef<SVGSVGElement, StudioIconProps>(({ size = 24, strokeWidth = 1.5, absoluteStrokeWidth: _absolute, ...rest }, ref) => (
        <Component width={size} height={size} strokeWidth={strokeWidth} color="currentColor" data-icon={name} {...rest} ref={ref} />
    ));
    Icon.displayName = name;
    return Icon;
}

export const ArrowLeft = iconoir(IconoirArrowLeft as IconoirComponent, "ArrowLeft");
export const ArrowLeftRight = iconoir(IconoirArrowSeparate as IconoirComponent, "ArrowLeftRight");
export const ArrowRight = iconoir(IconoirArrowRight as IconoirComponent, "ArrowRight");
export const ArrowUp = iconoir(IconoirArrowUp as IconoirComponent, "ArrowUp");
export const ArrowUpLeft = iconoir(IconoirArrowUpLeft as IconoirComponent, "ArrowUpLeft");
export const AudioFill = iconoir(IconoirSoundHigh as IconoirComponent, "AudioFill");
export const AudioLines = iconoir(IconoirSoundHigh as IconoirComponent, "AudioLines");
export const AudioWaveform = iconoir(IconoirVoice as IconoirComponent, "AudioWaveform");
export const BookOpen = iconoir(IconoirOpenBook as IconoirComponent, "BookOpen");
export const Box = iconoir(IconoirBox3dPoint as IconoirComponent, "Box");
export const BrandFill = iconoir(IconoirPalette as IconoirComponent, "BrandFill");
export const Briefcase = iconoir(IconoirSuitcase as IconoirComponent, "Briefcase");
export const Building2 = iconoir(IconoirBuilding as IconoirComponent, "Building2");
export const CalendarDays = iconoir(IconoirCalendar as IconoirComponent, "CalendarDays");
export const Camera = iconoir(IconoirCamera as IconoirComponent, "Camera");
export const CharacterFill = iconoir(IconoirUser as IconoirComponent, "CharacterFill");
export const ChatFill = iconoir(IconoirChatBubble as IconoirComponent, "ChatFill");
export const Check = iconoir(IconoirCheck as IconoirComponent, "Check");
export const ChevronDown = iconoir(IconoirNavArrowDown as IconoirComponent, "ChevronDown");
export const ChevronLeft = iconoir(IconoirNavArrowLeft as IconoirComponent, "ChevronLeft");
export const ChevronRight = iconoir(IconoirNavArrowRight as IconoirComponent, "ChevronRight");
export const Circle = iconoir(IconoirCircle as IconoirComponent, "Circle");
export const CircleHelp = iconoir(IconoirHelpCircle as IconoirComponent, "CircleHelp");
export const Clapperboard = iconoir(IconoirMovie as IconoirComponent, "Clapperboard");
export const Compass = iconoir(IconoirCompass as IconoirComponent, "Compass");
export const Copy = iconoir(IconoirCopy as IconoirComponent, "Copy");
export const Crop = iconoir(IconoirCrop as IconoirComponent, "Crop");
export const Crown = iconoir(IconoirCrown as IconoirComponent, "Crown");
export const DirectorFill = iconoir(IconoirMovie as IconoirComponent, "DirectorFill");
export const Download = iconoir(IconoirDownload as IconoirComponent, "Download");
export const Earth = iconoir(IconoirGlobe as IconoirComponent, "Earth");
export const Expand = iconoir(IconoirExpand as IconoirComponent, "Expand");
export const FastForward = iconoir(IconoirForward as IconoirComponent, "FastForward");
export const FileText = iconoir(IconoirPage as IconoirComponent, "FileText");
export const Film = iconoir(IconoirMovie as IconoirComponent, "Film");
export const Filter = iconoir(IconoirFilter as IconoirComponent, "Filter");
export const Flame = iconoir(IconoirFireFlame as IconoirComponent, "Flame");
export const Folder = iconoir(IconoirFolder as IconoirComponent, "Folder");
export const FolderInput = iconoir(IconoirFolderPlus as IconoirComponent, "FolderInput");
export const FolderMinus = iconoir(IconoirFolderMinus as IconoirComponent, "FolderMinus");
export const FolderOpen = iconoir(IconoirFolder as IconoirComponent, "FolderOpen");
export const FolderPlus = iconoir(IconoirFolderPlus as IconoirComponent, "FolderPlus");
export const Gift = iconoir(IconoirGift as IconoirComponent, "Gift");
export const Globe = iconoir(IconoirGlobe as IconoirComponent, "Globe");
export const Grid2x2 = iconoir(IconoirViewGrid as IconoirComponent, "Grid2x2");
export const Grid3x3 = iconoir(IconoirViewGrid as IconoirComponent, "Grid3x3");
export const Headset = iconoir(IconoirHeadset as IconoirComponent, "Headset");
export const Heart = iconoir(IconoirHeart as IconoirComponent, "Heart");
export const Home = iconoir(IconoirHome as IconoirComponent, "Home");
export const Image = iconoir(IconoirMediaImage as IconoirComponent, "Image");
export const ImageFill = iconoir(IconoirMediaImage as IconoirComponent, "ImageFill");
export const ImagePlay = iconoir(IconoirMediaVideo as IconoirComponent, "ImagePlay");
export const ImagePlus = iconoir(IconoirMediaImagePlus as IconoirComponent, "ImagePlus");
export const ImageUp = iconoir(IconoirMediaImageList as IconoirComponent, "ImageUp");
export const Info = iconoir(IconoirInfoCircle as IconoirComponent, "Info");
export const Languages = iconoir(IconoirLanguage as IconoirComponent, "Languages");
export const Layers = iconoir(IconoirBookStack as IconoirComponent, "Layers");
export const LayoutGrid = iconoir(IconoirViewGrid as IconoirComponent, "LayoutGrid");
export const LayoutTemplate = iconoir(IconoirViewColumns3 as IconoirComponent, "LayoutTemplate");
export const Library = iconoir(IconoirBook as IconoirComponent, "Library");
export const Lightbulb = iconoir(IconoirLightBulb as IconoirComponent, "Lightbulb");
export const Link = iconoir(IconoirLink as IconoirComponent, "Link");
export const List = iconoir(IconoirList as IconoirComponent, "List");
export const ListVideo = iconoir(IconoirMediaVideoList as IconoirComponent, "ListVideo");
export const Loader2 = iconoir(IconoirRefreshDouble as IconoirComponent, "Loader2");
export const MapPin = iconoir(IconoirMapPin as IconoirComponent, "MapPin");
export const Maximize2 = iconoir(IconoirExpand as IconoirComponent, "Maximize2");
export const Megaphone = iconoir(IconoirMegaphone as IconoirComponent, "Megaphone");
export const MessageSquarePlus = iconoir(IconoirChatPlusIn as IconoirComponent, "MessageSquarePlus");
export const MessageSquareText = iconoir(IconoirChatLines as IconoirComponent, "MessageSquareText");
export const MessageSquareWarning = iconoir(IconoirChatBubbleWarning as IconoirComponent, "MessageSquareWarning");
export const Mic = iconoir(IconoirMicrophone as IconoirComponent, "Mic");
export const MicVocal = iconoir(IconoirMicrophoneSpeaking as IconoirComponent, "MicVocal");
export const MonitorUp = iconoir(IconoirHd as IconoirComponent, "MonitorUp");
export const Mountain = iconoir(IconoirPlanet as IconoirComponent, "Mountain");
export const MountainSnow = iconoir(IconoirPlanet as IconoirComponent, "MountainSnow");
export const Music = iconoir(IconoirMusicDoubleNote as IconoirComponent, "Music");
export const Orbit = iconoir(IconoirRotateCameraRight as IconoirComponent, "Orbit");
export const Palette = iconoir(IconoirPalette as IconoirComponent, "Palette");
export const PanelLeft = iconoir(IconoirSidebarCollapse as IconoirComponent, "PanelLeft");
export const Paperclip = iconoir(IconoirAttachment as IconoirComponent, "Paperclip");
export const Pause = iconoir(IconoirPause as IconoirComponent, "Pause");
export const PenLine = iconoir(IconoirEditPencil as IconoirComponent, "PenLine");
export const Pencil = iconoir(IconoirEditPencil as IconoirComponent, "Pencil");
export const PersonStanding = iconoir(IconoirRunning as IconoirComponent, "PersonStanding");
export const Pin = iconoir(IconoirPin as IconoirComponent, "Pin");
export const Play = iconoir(IconoirPlay as IconoirComponent, "Play");
export const Plus = iconoir(IconoirPlus as IconoirComponent, "Plus");
export const RefreshCw = iconoir(IconoirRefresh as IconoirComponent, "RefreshCw");
export const Replace = iconoir(IconoirRepeat as IconoirComponent, "Replace");
export const Rotate3d = iconoir(IconoirRotateCameraLeft as IconoirComponent, "Rotate3d");
export const RotateCcw = iconoir(IconoirUndo as IconoirComponent, "RotateCcw");
export const ScanFace = iconoir(IconoirFaceId as IconoirComponent, "ScanFace");
export const ScanText = iconoir(IconoirScanQrCode as IconoirComponent, "ScanText");
export const Search = iconoir(IconoirSearch as IconoirComponent, "Search");
export const Share2 = iconoir(IconoirShareAndroid as IconoirComponent, "Share2");
export const SlidersHorizontal = iconoir(IconoirSettings as IconoirComponent, "SlidersHorizontal");
export const Sparkles = iconoir(IconoirSparks as IconoirComponent, "Sparkles");
export const Speaker = iconoir(IconoirSoundHigh as IconoirComponent, "Speaker");
export const Square = iconoir(IconoirSquare as IconoirComponent, "Square");
export const Star = iconoir(IconoirStar as IconoirComponent, "Star");
export const Store = iconoir(IconoirShop as IconoirComponent, "Store");
export const SunMedium = iconoir(IconoirSunLight as IconoirComponent, "SunMedium");
export const Tag = iconoir(IconoirLabel as IconoirComponent, "Tag");
export const ToolsFill = iconoir(IconoirSparks as IconoirComponent, "ToolsFill");
export const Trash2 = iconoir(IconoirTrash as IconoirComponent, "Trash2");
export const Type = iconoir(IconoirText as IconoirComponent, "Type");
export const Upload = iconoir(IconoirUpload as IconoirComponent, "Upload");
export const UserCheck = iconoir(IconoirUserBadgeCheck as IconoirComponent, "UserCheck");
export const UserPen = iconoir(IconoirUserCircle as IconoirComponent, "UserPen");
export const UserPlus = iconoir(IconoirUserPlus as IconoirComponent, "UserPlus");
export const UserRound = iconoir(IconoirUser as IconoirComponent, "UserRound");
export const Users = iconoir(IconoirGroup as IconoirComponent, "Users");
export const Video = iconoir(IconoirVideoCamera as IconoirComponent, "Video");
export const VideoFill = iconoir(IconoirVideoCamera as IconoirComponent, "VideoFill");
export const Volume2 = iconoir(IconoirSoundHigh as IconoirComponent, "Volume2");
export const Wallpaper = iconoir(IconoirMediaImage as IconoirComponent, "Wallpaper");
export const Wand2 = iconoir(IconoirMagicWand as IconoirComponent, "Wand2");
export const WandSparkles = iconoir(IconoirMagicWand as IconoirComponent, "WandSparkles");
export const Waypoints = iconoir(IconoirNetwork as IconoirComponent, "Waypoints");
export const WorldFill = iconoir(IconoirPlanet as IconoirComponent, "WorldFill");
export const X = iconoir(IconoirXmark as IconoirComponent, "X");
export const ZoomIn = iconoir(IconoirZoomIn as IconoirComponent, "ZoomIn");
export const ImageIcon = Image;
