const ReportModel = require("../../models/Report");
const ProductModel = require("../../models/Products");
const { RESOLUTIONS } = require("../../models/Report");
const { getPagination, buildPaginationMeta } = require("../../utils/pagination");

const listReports = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.targetType) filter.targetType = req.query.targetType;

    const [reports, total] = await Promise.all([
      ReportModel.find(filter)
        .populate("reporter", "firstName lastName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ReportModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: reports,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("List reports error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Resolves the reported target alongside the report itself where possible —
// today only "product" targets can actually be looked up.
const getReportById = async (req, res) => {
  const { id } = req.params;

  try {
    const report = await ReportModel.findById(id).populate("reporter", "firstName lastName email");

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    let target = null;
    if (report.targetType === "product") {
      target = await ProductModel.findById(report.targetId).populate("vendor", "businessName businessAddress");
    }

    return res.status(200).json({ report, target });
  } catch (error) {
    console.error("Get report error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const resolveReport = async (req, res) => {
  const { id } = req.params;
  const { resolution, resolutionNote } = req.body;

  if (resolution !== undefined && !RESOLUTIONS.includes(resolution)) {
    return res.status(400).json({ message: `resolution must be one of: ${RESOLUTIONS.join(", ")}` });
  }

  try {
    const report = await ReportModel.findById(id);

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    if (report.status === "resolved") {
      return res.status(400).json({ message: "Report is already resolved" });
    }

    report.status = "resolved";
    report.resolution = resolution;
    report.resolutionNote = resolutionNote;
    report.resolvedBy = req.admin._id;
    report.resolvedAt = new Date();
    await report.save();

    return res.status(200).json({ message: "Report resolved", report });
  } catch (error) {
    console.error("Resolve report error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = { listReports, getReportById, resolveReport };
