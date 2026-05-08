--新高/新低周期数排序规则
function chgbpColor(this, row, colname,zdbp)
  if tonumber(zdbp) and tonumber(zdbp)~= 0 then
        local color = 0
        local col = ZdViewApi("CXmlGridCtrl::GetColPos", this, colname)
        if tonumber(zdbp)>=50 then
            color = 'R'
        elseif tonumber(zdbp)<50 then
            color = 'G'
        end
        ZdViewApi("CGridCtrl::SetItemFgColour", this, row, col, color)
        -- .."BP"
        return string.format("%.2f", tonumber(zdbp))
    else
        return "0.00"
  end
    return 1
end

function calcYJL(now, jjjz)
    local nowNum = tonumber(now)
    local jjjzNum = tonumber(jjjz)
    if jjjzNum == 0 then
        return "--"
    end
    return string.format("%.2f", (nowNum / jjjzNum - 1) * 100)
end