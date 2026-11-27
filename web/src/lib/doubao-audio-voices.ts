// 来源：火山引擎 seed-audio-1.0（豆包音频生成）官方只接受「豆包语音合成 2.0」音色（*_uranus_bigtts、ICL_uranus_*_tob）或复刻音色；
// 1.0 的 *_mars_bigtts / *_moon_bigtts 会被拒绝（speaker not found）。中文音色也能读英文。

export type DoubaoAudioVoiceOption = {
    scene: string;
    value: string;
    label: string;
    language: string;
};

export const doubaoDefaultAudioVoice = "zh_female_shuangkuaisisi_uranus_bigtts";

export const doubaoAudioVoiceOptions: DoubaoAudioVoiceOption[] = [
    { scene: "英文音色", value: "ICL_uranus_en_female_charlie_tob", label: "美式英语 · Charlie", language: "美式英语" },
    { scene: "英文音色", value: "ICL_uranus_en_male_noah_tob", label: "美式英语 · Noah", language: "美式英语" },
    { scene: "英文音色", value: "ICL_uranus_en_male_michael_tob", label: "美式英语 · Michael", language: "美式英语" },
    { scene: "英文音色", value: "ICL_uranus_en_male_xavier_tob", label: "美式英语 · Xavier", language: "美式英语" },
    { scene: "英文音色", value: "ICL_uranus_en_male_zayne_tob", label: "美式英语 · Zayne", language: "美式英语" },
    { scene: "英文音色", value: "ICL_uranus_en_male_ethan_tob", label: "澳洲英语 · Ethan", language: "澳洲英语" },
    { scene: "英文音色", value: "ICL_uranus_en_male_alastor_tob", label: "英式英语 · Alastor", language: "英式英语" },
    { scene: "英文音色", value: "ICL_uranus_en_male_big_boogie_tob", label: "美式英语 · Big Boogie", language: "美式英语" },
    { scene: "英文音色", value: "ICL_uranus_en_male_kevin_mccallister_tob", label: "美式英语 · Kevin McCallister", language: "美式英语" },
    { scene: "英文角色", value: "ICL_uranus_en_male_chucky_tob", label: "美式英语 · Chucky", language: "美式英语" },
    { scene: "英文角色", value: "ICL_uranus_en_male_jigsaw_tob", label: "美式英语 · Jigsaw", language: "美式英语" },
    { scene: "英文角色", value: "ICL_uranus_en_male_clown_man_tob", label: "美式英语 · Clown Man", language: "美式英语" },
    { scene: "英文角色", value: "ICL_uranus_en_male_cartoon_chef_tob", label: "美式英语 · Cartoon Chef", language: "美式英语" },
    { scene: "英文角色", value: "ICL_uranus_en_male_frosty_man_tob", label: "美式英语 · Frosty Man", language: "美式英语" },
    { scene: "英文角色", value: "ICL_uranus_en_male_the_grinch_tob", label: "美式英语 · The Grinch", language: "美式英语" },
    { scene: "通用场景", value: "zh_female_vv_uranus_bigtts", label: "Vivi（多语种）", language: "中文、日语、印尼语、墨西哥西语" },
    { scene: "通用场景", value: "zh_female_xiaohe_uranus_bigtts", label: "小何", language: "中文" },
    { scene: "通用场景", value: "zh_male_m191_uranus_bigtts", label: "云舟", language: "中文" },
    { scene: "通用场景", value: "zh_male_taocheng_uranus_bigtts", label: "小天", language: "中文" },
    { scene: "通用场景", value: "zh_male_liufei_uranus_bigtts", label: "刘飞", language: "中文" },
    { scene: "通用场景", value: "zh_female_sophie_uranus_bigtts", label: "魅力苏菲", language: "中文" },
    { scene: "通用场景", value: "zh_female_qingxinnvsheng_uranus_bigtts", label: "清新女声", language: "中文" },
    { scene: "角色扮演", value: "zh_female_cancan_uranus_bigtts", label: "知性灿灿", language: "中文" },
    { scene: "角色扮演", value: "zh_female_sajiaoxuemei_uranus_bigtts", label: "撒娇学妹", language: "中文" },
    { scene: "通用场景", value: "zh_female_tianmeixiaoyuan_uranus_bigtts", label: "甜美小源", language: "中文" },
    { scene: "通用场景", value: "zh_female_tianmeitaozi_uranus_bigtts", label: "甜美桃子", language: "中文" },
    { scene: "通用场景", value: "zh_female_shuangkuaisisi_uranus_bigtts", label: "爽快思思", language: "中文" },
    { scene: "通用场景", value: "zh_female_linjianvhai_uranus_bigtts", label: "邻家女孩", language: "中文" },
    { scene: "通用场景", value: "zh_male_shaonianzixin_uranus_bigtts", label: "少年梓辛", language: "中文" },
    { scene: "教育场景", value: "zh_female_yingyujiaoxue_uranus_bigtts", label: "Tina老师", language: "中文、英式英语" },
    { scene: "客服场景", value: "zh_female_kefunvsheng_uranus_bigtts", label: "暖阳女声", language: "中文" },
    { scene: "有声阅读", value: "zh_female_xiaoxue_uranus_bigtts", label: "儿童绘本", language: "中文" },
    { scene: "视频配音", value: "zh_male_dayi_uranus_bigtts", label: "大壹", language: "中文" },
    { scene: "视频配音", value: "zh_female_jitangnv_uranus_bigtts", label: "鸡汤女", language: "中文" },
    { scene: "通用场景", value: "zh_female_meilinvyou_uranus_bigtts", label: "魅力女友", language: "中文" },
    { scene: "视频配音", value: "zh_female_liuchangnv_uranus_bigtts", label: "流畅女声", language: "中文" },
    { scene: "视频配音", value: "zh_male_ruyayichen_uranus_bigtts", label: "儒雅逸辰", language: "中文" },
    { scene: "通用场景", value: "zh_female_wenroumama_uranus_bigtts", label: "温柔妈妈", language: "中文" },
    { scene: "通用场景", value: "zh_male_jieshuoxiaoming_uranus_bigtts", label: "解说小明", language: "中文" },
    { scene: "通用场景", value: "zh_female_tvbnv_uranus_bigtts", label: "TVB女声", language: "中文" },
    { scene: "通用场景", value: "zh_male_yizhipiannan_uranus_bigtts", label: "译制片男", language: "中文" },
    { scene: "通用场景", value: "zh_female_qiaopinv_uranus_bigtts", label: "俏皮女声", language: "中文" },
    { scene: "角色扮演", value: "zh_female_zhishuaiyingzi_uranus_bigtts", label: "直率英子", language: "中文" },
    { scene: "通用场景", value: "zh_male_linjiananhai_uranus_bigtts", label: "邻家男孩", language: "中文" },
    { scene: "通用场景", value: "zh_male_ruyaqingnian_uranus_bigtts", label: "儒雅青年", language: "中文" },
    { scene: "通用场景", value: "zh_male_wennuanahu_uranus_bigtts", label: "温暖阿虎", language: "中文" },
    { scene: "通用场景", value: "zh_female_popo_uranus_bigtts", label: "婆婆", language: "中文" },
    { scene: "通用场景", value: "zh_female_gaolengyujie_uranus_bigtts", label: "高冷御姐", language: "中文" },
    { scene: "通用场景", value: "zh_male_aojiaobazong_uranus_bigtts", label: "傲娇霸总", language: "中文" },
    { scene: "通用场景", value: "zh_male_fanjuanqingnian_uranus_bigtts", label: "反卷青年", language: "中文" },
    { scene: "通用场景", value: "zh_female_wenroushunv_uranus_bigtts", label: "温柔淑女", language: "中文" },
    { scene: "通用场景", value: "zh_male_huolixiaoge_uranus_bigtts", label: "活力小哥", language: "中文" },
    { scene: "有声阅读", value: "zh_male_baqiqingshu_uranus_bigtts", label: "霸气青叔", language: "中文" },
    { scene: "有声阅读", value: "zh_male_xuanyijieshuo_uranus_bigtts", label: "悬疑解说", language: "中文" },
    { scene: "通用场景", value: "zh_female_mengyatou_uranus_bigtts", label: "萌丫头", language: "中文" },
    { scene: "通用场景", value: "zh_female_tiexinnvsheng_uranus_bigtts", label: "贴心女声", language: "中文" },
    { scene: "通用场景", value: "zh_female_jitangmei_uranus_bigtts", label: "鸡汤妹妹", language: "中文" },
    { scene: "通用场景", value: "zh_male_cixingjieshuonan_uranus_bigtts", label: "磁性解说男声", language: "中文" },
    { scene: "通用场景", value: "zh_female_kailangjiejie_uranus_bigtts", label: "开朗姐姐", language: "中文" },
    { scene: "通用场景", value: "zh_male_gaolengchenwen_uranus_bigtts", label: "高冷沉稳", language: "中文" },
    { scene: "通用场景", value: "zh_male_shenyeboke_uranus_bigtts", label: "深夜播客", language: "中文" },
    { scene: "通用场景", value: "zh_male_kailangdidi_uranus_bigtts", label: "开朗弟弟", language: "中文" },
    { scene: "通用场景", value: "zh_female_qinqienv_uranus_bigtts", label: "亲切女声", language: "中文" },
    { scene: "通用场景", value: "zh_male_kuailexiaodong_uranus_bigtts", label: "快乐小东", language: "中文" },
    { scene: "通用场景", value: "zh_male_kailangxuezhang_uranus_bigtts", label: "开朗学长", language: "中文" },
    { scene: "通用场景", value: "zh_male_youyoujunzi_uranus_bigtts", label: "悠悠君子", language: "中文" },
    { scene: "通用场景", value: "zh_female_wenjingmaomao_uranus_bigtts", label: "文静毛毛", language: "中文" },
    { scene: "通用场景", value: "zh_female_zhixingnv_uranus_bigtts", label: "知性女声", language: "中文" },
    { scene: "通用场景", value: "zh_male_qingshuangnanda_uranus_bigtts", label: "清爽男大", language: "中文" },
    { scene: "通用场景", value: "zh_male_yuanboxiaoshu_uranus_bigtts", label: "渊博小叔", language: "中文" },
    { scene: "通用场景", value: "zh_male_yangguangqingnian_uranus_bigtts", label: "阳光青年", language: "中文" },
    { scene: "通用场景", value: "zh_female_qingchezizi_uranus_bigtts", label: "清澈梓梓", language: "中文" },
    { scene: "通用场景", value: "zh_female_tianmeiyueyue_uranus_bigtts", label: "甜美悦悦", language: "中文" },
    { scene: "通用场景", value: "zh_female_xinlingjitang_uranus_bigtts", label: "心灵鸡汤", language: "中文" },
    { scene: "通用场景", value: "zh_male_wenrouxiaoge_uranus_bigtts", label: "温柔小哥", language: "中文" },
    { scene: "通用场景", value: "zh_female_roumeinvyou_uranus_bigtts", label: "柔美女友", language: "中文" },
    { scene: "通用场景", value: "zh_male_dongfanghaoran_uranus_bigtts", label: "东方浩然", language: "中文" },
    { scene: "通用场景", value: "zh_female_wenrouxiaoya_uranus_bigtts", label: "温柔小雅", language: "中文" },
    { scene: "通用场景", value: "zh_male_guanggaojieshuo_uranus_bigtts", label: "广告解说", language: "中文" },
    { scene: "有声阅读", value: "zh_female_shaoergushi_uranus_bigtts", label: "少儿故事", language: "中文" },
];

/** 旧版保存的 1.0 音色（上游已不接受）当作未选择，交给模型默认音色。 */
export function isRetiredDoubaoVoice(value: string) {
    return /_(mars|moon)_bigtts$|_wvae_bigtts$/.test(value);
}
