package app

import (
	"strings"
	"time"

	"yingce/backend/internal/model"
)

const (
	studioFolderLimit = 100
	studioLabelLimit  = 50
	studioOrganizeMax = 200
)

// 标签可选颜色，与前端色板一致。
var studioLabelColors = map[string]bool{"gray": true, "red": true, "orange": true, "yellow": true, "green": true, "blue": true, "purple": true, "pink": true}

type StudioFolderView struct {
	model.StudioFolder
	Count int64 `json:"count"`
}

type StudioOrganize struct {
	Folders []StudioFolderView  `json:"folders"`
	Labels  []model.StudioLabel `json:"labels"`
}

// StudioOrganizeData 列出本人的文件夹（含作品数）和标签。
func (s *Service) StudioOrganizeData(userID string) (StudioOrganize, error) {
	folders, err := s.repo.StudioFolders(userID)
	if err != nil {
		return StudioOrganize{}, err
	}
	counts, err := s.repo.StudioFolderCounts(userID)
	if err != nil {
		return StudioOrganize{}, err
	}
	labels, err := s.repo.StudioLabels(userID)
	if err != nil {
		return StudioOrganize{}, err
	}
	views := make([]StudioFolderView, 0, len(folders))
	for _, folder := range folders {
		views = append(views, StudioFolderView{StudioFolder: folder, Count: counts[folder.ID]})
	}
	return StudioOrganize{Folders: views, Labels: labels}, nil
}

func cleanOrganizeName(name string, max int, empty, tooLong string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", BadAuthRequest(empty)
	}
	return limitText(name, max, tooLong)
}

func (s *Service) CreateStudioFolder(userID, name string) (model.StudioFolder, error) {
	name, err := cleanOrganizeName(name, 60, "请填写文件夹名称", "文件夹名称太长")
	if err != nil {
		return model.StudioFolder{}, err
	}
	count, err := s.repo.CountStudioFolders(userID)
	if err != nil {
		return model.StudioFolder{}, err
	}
	if count >= studioFolderLimit {
		return model.StudioFolder{}, BadAuthRequest("文件夹最多 100 个")
	}
	item := model.StudioFolder{ID: newID(), UserID: userID, Name: name, Seq: studioSeq(), CreatedAt: time.Now().UTC()}
	return item, s.repo.CreateStudioFolder(&item)
}

func (s *Service) RenameStudioFolder(userID, id, name string) error {
	name, err := cleanOrganizeName(name, 60, "请填写文件夹名称", "文件夹名称太长")
	if err != nil {
		return err
	}
	updated, err := s.repo.RenameStudioFolder(userID, strings.TrimSpace(id), name)
	if err != nil {
		return err
	}
	if !updated {
		return NotFound("文件夹不存在")
	}
	return nil
}

func (s *Service) DeleteStudioFolder(userID, id string) error {
	deleted, err := s.repo.DeleteStudioFolder(userID, strings.TrimSpace(id))
	if err != nil {
		return err
	}
	if !deleted {
		return NotFound("文件夹不存在")
	}
	return nil
}

func (s *Service) CreateStudioLabel(userID, name, color string) (model.StudioLabel, error) {
	name, err := cleanOrganizeName(name, 40, "请填写标签名称", "标签名称太长")
	if err != nil {
		return model.StudioLabel{}, err
	}
	if color == "" {
		color = "gray"
	}
	if !studioLabelColors[color] {
		return model.StudioLabel{}, BadAuthRequest("标签颜色无效")
	}
	count, err := s.repo.CountStudioLabels(userID)
	if err != nil {
		return model.StudioLabel{}, err
	}
	if count >= studioLabelLimit {
		return model.StudioLabel{}, BadAuthRequest("标签最多 50 个")
	}
	item := model.StudioLabel{ID: newID(), UserID: userID, Name: name, Color: color, Seq: studioSeq(), CreatedAt: time.Now().UTC()}
	return item, s.repo.CreateStudioLabel(&item)
}

func (s *Service) UpdateStudioLabel(userID, id, name, color string) error {
	fields := map[string]any{}
	if strings.TrimSpace(name) != "" {
		cleaned, err := cleanOrganizeName(name, 40, "请填写标签名称", "标签名称太长")
		if err != nil {
			return err
		}
		fields["name"] = cleaned
	}
	if color != "" {
		if !studioLabelColors[color] {
			return BadAuthRequest("标签颜色无效")
		}
		fields["color"] = color
	}
	if len(fields) == 0 {
		return BadAuthRequest("没有要修改的内容")
	}
	updated, err := s.repo.UpdateStudioLabel(userID, strings.TrimSpace(id), fields)
	if err != nil {
		return err
	}
	if !updated {
		return NotFound("标签不存在")
	}
	return nil
}

func (s *Service) DeleteStudioLabel(userID, id string) error {
	deleted, err := s.repo.DeleteStudioLabel(userID, strings.TrimSpace(id))
	if err != nil {
		return err
	}
	if !deleted {
		return NotFound("标签不存在")
	}
	return nil
}

func (s *Service) ownedStudioTasks(userID string, taskIDs []string) ([]string, error) {
	if len(taskIDs) == 0 {
		return nil, BadAuthRequest("请先选择作品")
	}
	if len(taskIDs) > studioOrganizeMax {
		return nil, BadAuthRequest("一次最多整理 200 个作品")
	}
	owned, err := s.repo.StudioOwnedTaskIDs(userID, taskIDs)
	if err != nil {
		return nil, err
	}
	if len(owned) == 0 {
		return nil, NotFound("作品不存在")
	}
	return owned, nil
}

// MoveStudioWorks 把作品放进文件夹；folderID 为空表示移出文件夹。
func (s *Service) MoveStudioWorks(userID string, taskIDs []string, folderID string) (int, error) {
	owned, err := s.ownedStudioTasks(userID, taskIDs)
	if err != nil {
		return 0, err
	}
	folderID = strings.TrimSpace(folderID)
	if folderID != "" {
		folder, err := s.repo.StudioFolder(userID, folderID)
		if err != nil {
			return 0, err
		}
		if folder == nil {
			return 0, NotFound("文件夹不存在")
		}
	}
	return len(owned), s.repo.MoveStudioWorks(userID, owned, folderID)
}

// LabelStudioWorks 给作品加上或摘掉一个标签。
func (s *Service) LabelStudioWorks(userID string, taskIDs []string, labelID string, add bool) (int, error) {
	owned, err := s.ownedStudioTasks(userID, taskIDs)
	if err != nil {
		return 0, err
	}
	label, err := s.repo.StudioLabel(userID, strings.TrimSpace(labelID))
	if err != nil {
		return 0, err
	}
	if label == nil {
		return 0, NotFound("标签不存在")
	}
	return len(owned), s.repo.SetStudioWorksLabel(userID, owned, label.ID, add)
}
