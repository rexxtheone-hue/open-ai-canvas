package app

// list_voices 的预设音色：seed_audio（SeedAudio 1.0）只认「豆包语音合成 2.0」音色（*_uranus_bigtts 和英文 ICL_uranus_en_*_tob），
// 1.0 的 *_mars_bigtts / *_moon_bigtts 会被上游以 speaker not found 拒绝。中文音色也能读英文。

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
	{ID: "ICL_uranus_en_female_charlie_tob", Name: "Charlie", Gender: "female", Language: "American English", Scene: "multilingual"},
	{ID: "ICL_uranus_en_male_noah_tob", Name: "Noah", Gender: "male", Language: "American English", Scene: "multilingual"},
	{ID: "ICL_uranus_en_male_michael_tob", Name: "Michael", Gender: "male", Language: "American English", Scene: "multilingual"},
	{ID: "ICL_uranus_en_male_xavier_tob", Name: "Xavier", Gender: "male", Language: "American English", Scene: "multilingual"},
	{ID: "ICL_uranus_en_male_zayne_tob", Name: "Zayne", Gender: "male", Language: "American English", Scene: "multilingual"},
	{ID: "ICL_uranus_en_male_ethan_tob", Name: "Ethan", Gender: "male", Language: "Australian English", Scene: "multilingual"},
	{ID: "ICL_uranus_en_male_alastor_tob", Name: "Alastor", Gender: "male", Language: "British English", Scene: "multilingual"},
	{ID: "ICL_uranus_en_male_big_boogie_tob", Name: "Big Boogie", Gender: "male", Language: "American English", Scene: "multilingual"},
	{ID: "ICL_uranus_en_male_kevin_mccallister_tob", Name: "Kevin McCallister", Gender: "male", Language: "American English", Scene: "multilingual"},
	{ID: "ICL_uranus_en_male_chucky_tob", Name: "Chucky", Gender: "male", Language: "American English", Scene: "character"},
	{ID: "ICL_uranus_en_male_jigsaw_tob", Name: "Jigsaw", Gender: "male", Language: "American English", Scene: "character"},
	{ID: "ICL_uranus_en_male_clown_man_tob", Name: "Clown Man", Gender: "male", Language: "American English", Scene: "character"},
	{ID: "ICL_uranus_en_male_cartoon_chef_tob", Name: "Cartoon Chef", Gender: "male", Language: "American English", Scene: "character"},
	{ID: "ICL_uranus_en_male_frosty_man_tob", Name: "Frosty Man", Gender: "male", Language: "American English", Scene: "character"},
	{ID: "ICL_uranus_en_male_the_grinch_tob", Name: "The Grinch", Gender: "male", Language: "American English", Scene: "character"},
	{ID: "zh_female_vv_uranus_bigtts", Name: "Vivi", Gender: "female", Language: "中文、日语、印尼语、墨西哥西语", Scene: "通用"},
	{ID: "zh_female_xiaohe_uranus_bigtts", Name: "小何", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_male_m191_uranus_bigtts", Name: "云舟", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_male_taocheng_uranus_bigtts", Name: "小天", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_male_liufei_uranus_bigtts", Name: "刘飞", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_female_sophie_uranus_bigtts", Name: "魅力苏菲", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_female_qingxinnvsheng_uranus_bigtts", Name: "清新女声", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_female_cancan_uranus_bigtts", Name: "知性灿灿", Gender: "female", Language: "中文", Scene: "角色"},
	{ID: "zh_female_sajiaoxuemei_uranus_bigtts", Name: "撒娇学妹", Gender: "female", Language: "中文", Scene: "角色"},
	{ID: "zh_female_tianmeixiaoyuan_uranus_bigtts", Name: "甜美小源", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_female_tianmeitaozi_uranus_bigtts", Name: "甜美桃子", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_female_shuangkuaisisi_uranus_bigtts", Name: "爽快思思", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_female_linjianvhai_uranus_bigtts", Name: "邻家女孩", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_male_shaonianzixin_uranus_bigtts", Name: "少年梓辛", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_female_yingyujiaoxue_uranus_bigtts", Name: "Tina老师", Gender: "female", Language: "中文、英式英语", Scene: "教育"},
	{ID: "zh_female_kefunvsheng_uranus_bigtts", Name: "暖阳女声", Gender: "female", Language: "中文", Scene: "客服"},
	{ID: "zh_female_xiaoxue_uranus_bigtts", Name: "儿童绘本", Gender: "female", Language: "中文", Scene: "有声阅读"},
	{ID: "zh_male_dayi_uranus_bigtts", Name: "大壹", Gender: "male", Language: "中文", Scene: "视频配音"},
	{ID: "zh_female_jitangnv_uranus_bigtts", Name: "鸡汤女", Gender: "female", Language: "中文", Scene: "视频配音"},
	{ID: "zh_female_meilinvyou_uranus_bigtts", Name: "魅力女友", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_female_liuchangnv_uranus_bigtts", Name: "流畅女声", Gender: "female", Language: "中文", Scene: "视频配音"},
	{ID: "zh_male_ruyayichen_uranus_bigtts", Name: "儒雅逸辰", Gender: "male", Language: "中文", Scene: "视频配音"},
	{ID: "zh_female_wenroumama_uranus_bigtts", Name: "温柔妈妈", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_male_jieshuoxiaoming_uranus_bigtts", Name: "解说小明", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_female_tvbnv_uranus_bigtts", Name: "TVB女声", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_male_yizhipiannan_uranus_bigtts", Name: "译制片男", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_female_qiaopinv_uranus_bigtts", Name: "俏皮女声", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_female_zhishuaiyingzi_uranus_bigtts", Name: "直率英子", Gender: "female", Language: "中文", Scene: "角色"},
	{ID: "zh_male_linjiananhai_uranus_bigtts", Name: "邻家男孩", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_male_ruyaqingnian_uranus_bigtts", Name: "儒雅青年", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_male_wennuanahu_uranus_bigtts", Name: "温暖阿虎", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_female_popo_uranus_bigtts", Name: "婆婆", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_female_gaolengyujie_uranus_bigtts", Name: "高冷御姐", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_male_aojiaobazong_uranus_bigtts", Name: "傲娇霸总", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_male_fanjuanqingnian_uranus_bigtts", Name: "反卷青年", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_female_wenroushunv_uranus_bigtts", Name: "温柔淑女", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_male_huolixiaoge_uranus_bigtts", Name: "活力小哥", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_male_baqiqingshu_uranus_bigtts", Name: "霸气青叔", Gender: "male", Language: "中文", Scene: "有声阅读"},
	{ID: "zh_male_xuanyijieshuo_uranus_bigtts", Name: "悬疑解说", Gender: "male", Language: "中文", Scene: "有声阅读"},
	{ID: "zh_female_mengyatou_uranus_bigtts", Name: "萌丫头", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_female_tiexinnvsheng_uranus_bigtts", Name: "贴心女声", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_female_jitangmei_uranus_bigtts", Name: "鸡汤妹妹", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_male_cixingjieshuonan_uranus_bigtts", Name: "磁性解说男声", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_female_kailangjiejie_uranus_bigtts", Name: "开朗姐姐", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_male_gaolengchenwen_uranus_bigtts", Name: "高冷沉稳", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_male_shenyeboke_uranus_bigtts", Name: "深夜播客", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_male_kailangdidi_uranus_bigtts", Name: "开朗弟弟", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_female_qinqienv_uranus_bigtts", Name: "亲切女声", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_male_kuailexiaodong_uranus_bigtts", Name: "快乐小东", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_male_kailangxuezhang_uranus_bigtts", Name: "开朗学长", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_male_youyoujunzi_uranus_bigtts", Name: "悠悠君子", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_female_wenjingmaomao_uranus_bigtts", Name: "文静毛毛", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_female_zhixingnv_uranus_bigtts", Name: "知性女声", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_male_qingshuangnanda_uranus_bigtts", Name: "清爽男大", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_male_yuanboxiaoshu_uranus_bigtts", Name: "渊博小叔", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_male_yangguangqingnian_uranus_bigtts", Name: "阳光青年", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_female_qingchezizi_uranus_bigtts", Name: "清澈梓梓", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_female_tianmeiyueyue_uranus_bigtts", Name: "甜美悦悦", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_female_xinlingjitang_uranus_bigtts", Name: "心灵鸡汤", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_male_wenrouxiaoge_uranus_bigtts", Name: "温柔小哥", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_female_roumeinvyou_uranus_bigtts", Name: "柔美女友", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_male_dongfanghaoran_uranus_bigtts", Name: "东方浩然", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_female_wenrouxiaoya_uranus_bigtts", Name: "温柔小雅", Gender: "female", Language: "中文", Scene: "通用"},
	{ID: "zh_male_guanggaojieshuo_uranus_bigtts", Name: "广告解说", Gender: "male", Language: "中文", Scene: "通用"},
	{ID: "zh_female_shaoergushi_uranus_bigtts", Name: "少儿故事", Gender: "female", Language: "中文", Scene: "有声阅读"},
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
