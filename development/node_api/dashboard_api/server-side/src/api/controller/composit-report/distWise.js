const router = require('express').Router();
const { logger } = require('../../lib/logger');
const auth = require('../../middleware/check-auth');
const s3File = require('../../lib/reads3File');

router.post('/distWise', auth.authController, async (req, res) => {
    try {
        logger.info('---composite report dist wise api ---');
        var management = req.body.management;
        var category = req.body.category;
        let fileName;

        if (management != 'overall' && category == 'overall') {
            fileName = `composite/school_management_category/overall_category/${management}/comp_district.json`
        } else {
            fileName = `composite/comp_district.json`
        }
        let jsonData = await s3File.readFileConfig(fileName);

        logger.info('--- composite dist wise api response sent ---');
        res.status(200).send(jsonData);

    } catch (e) {
        logger.error(`Error :: ${e}`)
        res.status(500).json({ errMessage: "Internal error. Please try again!!" });
    }
});

module.exports = router;