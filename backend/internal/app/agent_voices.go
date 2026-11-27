package app

// list_voices 的预设音色：seed_audio（SeedAudio 1.0，资源 seed-tts-1.0）的「豆包语音合成模型1.0」音色，和 Studio 下拉框同一份。

type WorkflowVoice struct {
	ID         string `json:"voice_id"`
	Type       string `json:"voice_type"`
	Name       string `json:"name"`
	Gender     any    `json:"gender"`
	Language   string `json:"language,omitempty"`
	Scene      string `json:"scene,omitempty"`
	PreviewURL string `json:"preview_url,omitempty"`
}

type workflowPresetVoice struct{ ID, Name, Gender, Language, Scene string }

var workflowPresetVoices = []workflowPresetVoice{
	{ID: "zh_male_lengkugege_emo_v2_mars_bigtts", Name: "冷酷哥哥", Gender: "male", Language: "中文", Scene: "多情感"},
	{ID: "zh_female_tianxinxiaomei_emo_v2_mars_bigtts", Name: "甜心小美", Gender: "female", Language: "中文", Scene: "多情感"},
	{ID: "zh_male_guangzhoudege_emo_mars_bigtts", Name: "广州德哥", Gender: "male", Language: "中文", Scene: "多情感"},
	{ID: "zh_male_jingqiangkanye_emo_mars_bigtts", Name: "京腔侃爷", Gender: "male", Language: "中文", Scene: "多情感"},
	{ID: "zh_female_linjuayi_emo_v2_mars_bigtts", Name: "邻居阿姨", Gender: "female", Language: "中文", Scene: "多情感"},
	{ID: "zh_male_yourougongzi_emo_v2_mars_bigtts", Name: "优柔公子", Gender: "male", Language: "中文", Scene: "多情感"},
	{ID: "zh_male_ruyayichen_emo_v2_mars_bigtts", Name: "儒雅男友", Gender: "male", Language: "中文", Scene: "多情感"},
	{ID: "zh_male_junlangnanyou_emo_v2_mars_bigtts", Name: "俊朗男友", Gender: "male", Language: "中文", Scene: "多情感"},
	{ID: "zh_male_beijingxiaoye_emo_v2_mars_bigtts", Name: "北京小爷", Gender: "male", Language: "中文", Scene: "多情感"},
	{ID: "zh_female_roumeinvyou_emo_v2_mars_bigtts", Name: "柔美女友", Gender: "female", Language: "中文", Scene: "多情感"},
	{ID: "zh_male_yangguangqingnian_emo_v2_mars_bigtts", Name: "阳光青年", Gender: "male", Language: "中文", Scene: "多情感"},
	{ID: "zh_female_meilinvyou_emo_v2_mars_bigtts", Name: "魅力女友", Gender: "female", Language: "中文", Scene: "多情感"},
	{ID: "zh_female_shuangkuaisisi_emo_v2_mars_bigtts", Name: "爽快思思", Gender: "female", Language: "中文、英式英语", Scene: "多情感"},
	{ID: "zh_male_shenyeboke_emo_v2_mars_bigtts", Name: "深夜播客", Gender: "male", Language: "中文", Scene: "多情感"},
	{ID: "en_female_candice_emo_v2_mars_bigtts", Name: "美式英语 · 坎迪丝", Gender: "female", Language: "美式英语", Scene: "多情感"},
	{ID: "zh_female_yingyujiaoyu_mars_bigtts", Name: "蒂娜老师", Gender: "female", Language: "中文、英式英语", Scene: "教育场景"},
	{ID: "zh_female_qinqienvsheng_moon_bigtts", Name: "亲切女声", Gender: "female", Language: "中文", Scene: "通用场景"},
	{ID: "zh_male_qingyiyuxuan_mars_bigtts", Name: "阳光阿辰", Gender: "male", Language: "中文", Scene: "通用场景"},
	{ID: "zh_male_xudong_conversation_wvae_bigtts", Name: "快乐小东", Gender: "male", Language: "中文、美式英语", Scene: "通用场景"},
	{ID: "en_male_jason_conversation_wvae_bigtts", Name: "开朗学长", Gender: "male", Language: "中文", Scene: "通用场景"},
	{ID: "zh_female_tianmeitaozi_mars_bigtts", Name: "甜美桃子", Gender: "female", Language: "中文", Scene: "通用场景"},
	{ID: "zh_female_qingxinnvsheng_mars_bigtts", Name: "清新女声", Gender: "female", Language: "中文", Scene: "通用场景"},
	{ID: "zh_female_zhixingnvsheng_mars_bigtts", Name: "知性女声", Gender: "female", Language: "中文", Scene: "通用场景"},
	{ID: "zh_male_qingshuangnanda_mars_bigtts", Name: "清爽男大", Gender: "male", Language: "中文", Scene: "通用场景"},
	{ID: "zh_female_linjianvhai_moon_bigtts", Name: "邻家女孩", Gender: "female", Language: "中文", Scene: "通用场景"},
	{ID: "zh_male_yuanboxiaoshu_moon_bigtts", Name: "渊博小叔", Gender: "male", Language: "中文", Scene: "通用场景"},
	{ID: "zh_male_yangguangqingnian_moon_bigtts", Name: "阳光青年", Gender: "male", Language: "中文", Scene: "通用场景"},
	{ID: "zh_female_tianmeixiaoyuan_moon_bigtts", Name: "甜美小源", Gender: "female", Language: "中文", Scene: "通用场景"},
	{ID: "zh_female_qingchezizi_moon_bigtts", Name: "清澈梓梓", Gender: "female", Language: "中文", Scene: "通用场景"},
	{ID: "zh_male_jieshuoxiaoming_moon_bigtts", Name: "解说小明", Gender: "male", Language: "中文", Scene: "通用场景"},
	{ID: "zh_female_kailangjiejie_moon_bigtts", Name: "开朗姐姐", Gender: "female", Language: "中文", Scene: "通用场景"},
	{ID: "zh_male_linjiananhai_moon_bigtts", Name: "邻家男孩", Gender: "male", Language: "中文", Scene: "通用场景"},
	{ID: "zh_female_tianmeiyueyue_moon_bigtts", Name: "甜美悦悦", Gender: "female", Language: "中文", Scene: "通用场景"},
	{ID: "zh_female_xinlingjitang_moon_bigtts", Name: "心灵鸡汤", Gender: "female", Language: "中文", Scene: "通用场景"},
	{ID: "zh_male_wenrouxiaoge_mars_bigtts", Name: "温柔小哥", Gender: "male", Language: "中文", Scene: "通用场景"},
	{ID: "zh_female_cancan_mars_bigtts", Name: "灿灿", Gender: "female", Language: "中文、美式英语", Scene: "通用场景"},
	{ID: "zh_female_shuangkuaisisi_moon_bigtts", Name: "爽快思思", Gender: "female", Language: "中文、美式英语", Scene: "通用场景"},
	{ID: "zh_male_wennuanahu_moon_bigtts", Name: "温暖阿虎", Gender: "male", Language: "中文、美式英语", Scene: "通用场景"},
	{ID: "zh_male_shaonianzixin_moon_bigtts", Name: "少年梓辛", Gender: "male", Language: "中文、美式英语", Scene: "通用场景"},
	{ID: "zh_female_yueyunv_mars_bigtts", Name: "粤语小溏", Gender: "female", Language: "中文", Scene: "趣味口音"},
	{ID: "zh_male_yuzhouzixuan_moon_bigtts", Name: "豫州子轩", Gender: "male", Language: "河南口音", Scene: "趣味口音"},
	{ID: "zh_female_daimengchuanmei_moon_bigtts", Name: "呆萌川妹", Gender: "female", Language: "四川口音", Scene: "趣味口音"},
	{ID: "zh_male_guangxiyuanzhou_moon_bigtts", Name: "广西远舟", Gender: "male", Language: "广西口音", Scene: "趣味口音"},
	{ID: "zh_male_zhoujielun_emo_v2_mars_bigtts", Name: "双节棍小哥", Gender: "male", Language: "台湾口音", Scene: "趣味口音"},
	{ID: "zh_female_wanwanxiaohe_moon_bigtts", Name: "湾湾小何", Gender: "female", Language: "台湾口音", Scene: "趣味口音"},
	{ID: "zh_female_wanqudashu_moon_bigtts", Name: "湾区大叔", Gender: "female", Language: "广东口音", Scene: "趣味口音"},
	{ID: "zh_male_guozhoudege_moon_bigtts", Name: "广州德哥", Gender: "male", Language: "广东口音", Scene: "趣味口音"},
	{ID: "zh_male_haoyuxiaoge_moon_bigtts", Name: "浩宇小哥", Gender: "male", Language: "青岛口音", Scene: "趣味口音"},
	{ID: "zh_male_beijingxiaoye_moon_bigtts", Name: "北京小爷", Gender: "male", Language: "北京口音", Scene: "趣味口音"},
	{ID: "zh_male_jingqiangkanye_moon_bigtts", Name: "京腔侃爷", Gender: "male", Language: "北京口音、美式英语", Scene: "趣味口音"},
	{ID: "zh_female_meituojieer_moon_bigtts", Name: "妹坨洁儿", Gender: "female", Language: "长沙口音", Scene: "趣味口音"},
	{ID: "zh_male_naiqimengwa_mars_bigtts", Name: "奶气萌娃", Gender: "male", Language: "中文", Scene: "角色扮演"},
	{ID: "zh_female_popo_mars_bigtts", Name: "婆婆", Gender: "female", Language: "中文", Scene: "角色扮演"},
	{ID: "zh_female_gaolengyujie_moon_bigtts", Name: "高冷御姐", Gender: "female", Language: "中文", Scene: "角色扮演"},
	{ID: "zh_male_aojiaobazong_moon_bigtts", Name: "傲娇霸总", Gender: "male", Language: "中文", Scene: "角色扮演"},
	{ID: "zh_female_meilinvyou_moon_bigtts", Name: "魅力女友", Gender: "female", Language: "中文", Scene: "角色扮演"},
	{ID: "zh_male_shenyeboke_moon_bigtts", Name: "深夜播客", Gender: "male", Language: "中文", Scene: "角色扮演"},
	{ID: "zh_female_sajiaonvyou_moon_bigtts", Name: "柔美女友", Gender: "female", Language: "中文", Scene: "角色扮演"},
	{ID: "zh_female_yuanqinvyou_moon_bigtts", Name: "撒娇学妹", Gender: "female", Language: "中文", Scene: "角色扮演"},
	{ID: "zh_male_dongfanghaoran_moon_bigtts", Name: "东方浩然", Gender: "male", Language: "中文", Scene: "角色扮演"},
	{ID: "en_male_adam_mars_bigtts", Name: "美式英语 · 亚当", Gender: "male", Language: "美式英语", Scene: "外语音色"},
	{ID: "en_female_amanda_mars_bigtts", Name: "美式英语 · 阿曼达", Gender: "female", Language: "美式英语", Scene: "外语音色"},
	{ID: "en_male_jackson_mars_bigtts", Name: "美式英语 · 杰克逊", Gender: "male", Language: "美式英语", Scene: "外语音色"},
	{ID: "en_male_smith_mars_bigtts", Name: "英式英语 · 史密斯", Gender: "male", Language: "英式英语", Scene: "外语音色"},
	{ID: "en_female_anna_mars_bigtts", Name: "英式英语 · 安娜", Gender: "female", Language: "英式英语", Scene: "外语音色"},
	{ID: "en_female_sarah_mars_bigtts", Name: "澳洲英语 · 萨拉", Gender: "female", Language: "澳洲英语", Scene: "外语音色"},
	{ID: "en_male_dryw_mars_bigtts", Name: "澳洲英语 · 德鲁", Gender: "male", Language: "澳洲英语", Scene: "外语音色"},
	{ID: "multi_male_M100_conversation_wvae_bigtts", Name: "西语 · 卢西亚", Gender: "male", Language: "西语", Scene: "外语音色"},
	{ID: "multi_zh_male_youyoujunzi_moon_bigtts", Name: "日语 · 光", Gender: "male", Language: "日语", Scene: "外语音色"},
	{ID: "multi_female_sophie_conversation_wvae_bigtts", Name: "日语 · 智美", Gender: "female", Language: "日语、西语", Scene: "外语音色"},
	{ID: "multi_male_xudong_conversation_wvae_bigtts", Name: "日语 · 正男", Gender: "male", Language: "日语、西语", Scene: "外语音色"},
	{ID: "multi_female_maomao_conversation_wvae_bigtts", Name: "日语 · 月", Gender: "female", Language: "日语、西语", Scene: "外语音色"},
	{ID: "multi_female_gaolengyujie_moon_bigtts", Name: "日语 · 朱美", Gender: "female", Language: "日语", Scene: "外语音色"},
	{ID: "multi_male_jingqiangkanye_moon_bigtts", Name: "日语 · 和音", Gender: "male", Language: "日语、西语", Scene: "外语音色"},
	{ID: "multi_female_shuangkuaisisi_moon_bigtts", Name: "日语 · 晴子", Gender: "female", Language: "日语、西语", Scene: "外语音色"},
	{ID: "multi_male_wanqudashu_moon_bigtts", Name: "日语 · 广志", Gender: "male", Language: "日语、西语", Scene: "外语音色"},
	{ID: "zh_male_M100_conversation_wvae_bigtts", Name: "悠悠君子", Gender: "male", Language: "中文、美式英语", Scene: "视频配音"},
	{ID: "zh_female_maomao_conversation_wvae_bigtts", Name: "文静毛毛", Gender: "female", Language: "中文", Scene: "视频配音"},
	{ID: "zh_female_wenrouxiaoya_moon_bigtts", Name: "温柔小雅", Gender: "female", Language: "中文", Scene: "视频配音"},
	{ID: "zh_male_tiancaitongsheng_mars_bigtts", Name: "天才童声", Gender: "male", Language: "中文", Scene: "视频配音"},
	{ID: "zh_male_sunwukong_mars_bigtts", Name: "猴哥", Gender: "male", Language: "中文", Scene: "视频配音"},
	{ID: "zh_male_xionger_mars_bigtts", Name: "熊二", Gender: "male", Language: "中文", Scene: "视频配音"},
	{ID: "zh_female_peiqi_mars_bigtts", Name: "佩奇猪", Gender: "female", Language: "中文", Scene: "视频配音"},
	{ID: "zh_female_wuzetian_mars_bigtts", Name: "武则天", Gender: "female", Language: "中文", Scene: "视频配音"},
	{ID: "zh_female_gujie_mars_bigtts", Name: "顾姐", Gender: "female", Language: "中文", Scene: "视频配音"},
	{ID: "zh_female_yingtaowanzi_mars_bigtts", Name: "樱桃丸子", Gender: "female", Language: "中文", Scene: "视频配音"},
	{ID: "zh_male_chunhui_mars_bigtts", Name: "广告解说", Gender: "male", Language: "中文", Scene: "视频配音"},
	{ID: "zh_female_shaoergushi_mars_bigtts", Name: "少儿故事", Gender: "female", Language: "中文", Scene: "视频配音"},
	{ID: "zh_male_silang_mars_bigtts", Name: "四郎", Gender: "male", Language: "中文", Scene: "视频配音"},
	{ID: "zh_female_qiaopinvsheng_mars_bigtts", Name: "俏皮女声", Gender: "female", Language: "中文", Scene: "视频配音"},
	{ID: "zh_male_lanxiaoyang_mars_bigtts", Name: "懒音绵宝", Gender: "male", Language: "中文", Scene: "视频配音"},
	{ID: "zh_male_dongmanhaimian_mars_bigtts", Name: "亮嗓萌仔", Gender: "male", Language: "中文", Scene: "视频配音"},
	{ID: "zh_female_jitangmeimei_mars_bigtts", Name: "鸡汤妹妹", Gender: "female", Language: "中文、美式英语", Scene: "视频配音"},
	{ID: "zh_female_tiexinnvsheng_mars_bigtts", Name: "贴心女声", Gender: "female", Language: "中文、美式英语", Scene: "视频配音"},
	{ID: "zh_female_mengyatou_mars_bigtts", Name: "萌丫头", Gender: "female", Language: "中文、美式英语", Scene: "视频配音"},
	{ID: "zh_male_changtianyi_mars_bigtts", Name: "悬疑解说", Gender: "male", Language: "中文", Scene: "有声阅读"},
	{ID: "zh_male_ruyaqingnian_mars_bigtts", Name: "儒雅青年", Gender: "male", Language: "中文", Scene: "有声阅读"},
	{ID: "zh_male_baqiqingshu_mars_bigtts", Name: "霸气青叔", Gender: "male", Language: "中文", Scene: "有声阅读"},
	{ID: "zh_male_qingcang_mars_bigtts", Name: "擎苍", Gender: "male", Language: "中文", Scene: "有声阅读"},
	{ID: "zh_male_yangguangqingnian_mars_bigtts", Name: "活力小哥", Gender: "male", Language: "中文", Scene: "有声阅读"},
	{ID: "zh_female_gufengshaoyu_mars_bigtts", Name: "古风少御", Gender: "female", Language: "中文", Scene: "有声阅读"},
	{ID: "zh_female_wenroushunv_mars_bigtts", Name: "温柔淑女", Gender: "female", Language: "中文", Scene: "有声阅读"},
	{ID: "zh_male_fanjuanqingnian_mars_bigtts", Name: "反卷青年", Gender: "male", Language: "中文", Scene: "有声阅读"},
}

// WorkflowVoices 先列本人「我的声音」（voice_type element，用样本音频克隆），再列预设音色。
func (s *Service) WorkflowVoices(userID string) ([]WorkflowVoice, error) {
	own, err := s.StudioVoices(userID)
	if err != nil {
		return nil, err
	}
	voices := make([]WorkflowVoice, 0, len(own)+len(workflowPresetVoices))
	for _, voice := range own {
		voices = append(voices, WorkflowVoice{ID: voice.ID, Type: "element", Name: voice.Name, Gender: nil, Scene: "我的声音"})
	}
	for _, voice := range workflowPresetVoices {
		var gender any
		if voice.Gender != "" {
			gender = voice.Gender
		}
		voices = append(voices, WorkflowVoice{ID: voice.ID, Type: "preset", Name: voice.Name, Gender: gender, Language: voice.Language, Scene: voice.Scene})
	}
	return voices, nil
}
