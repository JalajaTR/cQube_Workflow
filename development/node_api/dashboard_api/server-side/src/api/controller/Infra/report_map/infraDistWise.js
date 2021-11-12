const router = require('express').Router();
var const_data = require('../../../lib/config');
const { logger } = require('../../../lib/logger');
const auth = require('../../../middleware/check-auth');
const s3File = require('../../../lib/reads3File');

router.post('/distWise', auth.authController, async (req, res) => {
    try {
        logger.info('---Infra dist wise api ---');
        var management = req.body.management;
        var category = req.body.category;
        let fileName;

        if (management != 'overall' && category == 'overall') {
            fileName = `infra/school_management_category/overall_category/${management}/infra_district_map.json`;
        } else {
            fileName = `infra/infra_district_map.json`
        }
        let districtData = await s3File.readFileConfig(fileName);
        var mydata = districtData.data;

        logger.info('--- Infra dist wise api response sent ---');
        res.status(200).send({ data: mydata, footer: districtData.allDistrictsFooter.totalSchools });
    } catch (e) {
        logger.error(`Error :: ${e}`)
        res.status(500).json({ errMessage: "Internal error. Please try again!!" });
    }
});

module.exports = router;